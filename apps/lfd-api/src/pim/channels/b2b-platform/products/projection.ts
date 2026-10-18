import type {
  SyncAllergenLabels,
  SyncContextPrice,
  SyncMedia,
  SyncVariant,
} from "@lfd/catalog-sync";
import { htMillicentsOf } from "@lfd/pim-contracts";

import type {
  IncoProjection,
  IncoProjector,
} from "../../../allergens/domain/services/inco-projector.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { VariantRecord } from "../../../catalogue/product/domain/ports/product.repository.js";

/**
 * La clé du contexte que CE canal facture. Une constante nommée plutôt qu'une
 * chaîne au fil du code : elle désigne une ligne du registre, et le jour où elle
 * ne désigne plus rien, il n'y a qu'un endroit à corriger.
 */
const B2B_CONTEXT_KEY = "b2b";

/**
 * **La conversion d'une déclinaison vers le fil** — pure : aucun appel réseau,
 * aucune dépendance Nest, aucune horloge.
 *
 * Ce fichier portait aussi la projection du catalogue entier pour le push
 * (`projectCatalog`, son tri des déclinaisons, ses exclusions et ses
 * opérations datées) ; elle est partie avec le push et les opérations du
 * référentiel (X4 de `documentation/catalogue/catalogue-synchronise.md` §6).
 * Reste ce que les faits du catalogue réemploient (`catalog-facts.ts`) :
 * convertir une déclinaison, et le taux du contexte `b2b`.
 */

/**
 * **Ce qu'une vitrine montre d'une fiche** : une ligne et une pièce.
 *
 * Résolu en amont et passé ici, comme le taux et le rapport pro — l'éditorial
 * et les médias sont deux satellites du produit, avec leur propre table et leur
 * propre rythme, et les charger dans cette fonction la rendrait impure pour un
 * champ que le calcul n'utilise pas.
 */
export interface Showcase {
  /** `null` = aucun éditorial saisi. La chaîne vide serait une ligne effacée. */
  readonly note: string | null;
  readonly image: SyncMedia | null;
  /** La vignette de rayon — `null` si la fiche n'en désigne pas. */
  readonly thumbnail: SyncMedia | null;
}

/** Le français est la langue de la plateforme ; l'aplatissement se fait ici. */
function frenchOf(text: { readonly fr: string }): string {
  return text.fr;
}

/**
 * Le prix est passé **à part**, déjà converti en hors taxe et vérifié non nul
 * par l'appelant.
 *
 * Le lire depuis `variant.priceCents` obligerait à un repli (`?? 0`) qui
 * transformerait un oubli de tarification en produit gratuit — précisément la
 * faute que le tri en amont existe pour empêcher. Une signature qui ne peut pas
 * mentir vaut mieux qu'un commentaire promettant qu'elle ne ment pas.
 *
 * Et il est **hors taxe**, quelle que soit l'assiette de la déclinaison : la
 * plateforme professionnelle facture en HT de bout en bout, et la frontière du
 * TTC s'arrête à ce fichier. Cf.
 * `documentation/pricing/architecture-prix-ancre-ttc.md` § 4.
 */
export function projectVariant(
  variant: VariantRecord,
  htPriceMillicents: number,
  vatRatePercent: number | null,
  publicTtcCents: number,
  percents: CategoryVatPercents,
  inco: IncoProjector,
): SyncVariant {
  // Le `null` est transmis TEL QUEL : c'est la différence entre « rien n'a été
  // déclaré » et « rien ne s'y trouve », et elle ne se reconstitue pas en aval.
  // Les mentions le suivent — « aucune fiche » ne se lit jamais « aucun
  // allergène ». Les codes, eux, restent le stockage canonique ; leur copie
  // n'est que le passage du `readonly` du domaine au tableau du schéma de fil.
  const declared = variant.allergenSheet === null ? null : variant.allergenSheet.declared;
  return {
    // L'identifiant traverse depuis la v7 : une règle de rang « déclinaison »
    // vise celui-ci, et le récepteur ne pourrait pas la rattacher au SKU seul.
    id: variant.id,
    sku: variant.sku,
    name: frenchOf(variant.name),
    priceMillicents: htPriceMillicents,
    publicTtcCents,
    publicByContext: publicPricesOf(publicTtcCents, percents),
    weightGrams: variant.weightGrams,
    isDefault: variant.isDefault,
    position: variant.position,
    vatRatePercent,
    allergens: declared === null ? null : [...declared],
    allergenLabels: declared === null ? null : labelsOf(inco.project(declared)),
  };
}

/**
 * **Le prix public, contexte par contexte** — l'étiquette mise hors taxe à
 * chacun des taux réglés.
 *
 * 🔴 La conversion se fait ICI, comme celle du prix professionnel, et pour la
 * raison que ce fichier donne déjà plus bas : **c'est le dernier endroit qui
 * connaît encore l'assiette.** Le récepteur choisit une entrée ; il ne dérive
 * rien, et deux arrondis ne peuvent donc pas diverger entre les deux bouts.
 *
 * ⚠️ **Un contexte sans taux n'a pas d'entrée.** On n'invente jamais un taux —
 * c'est le même refus que `variant_sans_taux` un cran plus haut, et il vaut
 * aussi pour le public : un montant plausible qui n'a été décidé par personne
 * est exactement ce qu'on ne veut pas facturer.
 *
 * ⚠️ **Le contexte `b2b` y figure comme les autres**, et son hors taxe n'est PAS
 * `priceMillicents` : celui-ci porte le prix PRO (l'étiquette diminuée du
 * rapport), celui-là l'étiquette elle-même au taux b2b. Les deux sont des hors
 * taxe et c'est tout ce qu'ils partagent.
 */
function publicPricesOf(
  publicTtcCents: number,
  percents: CategoryVatPercents,
): Record<string, SyncContextPrice> {
  const byContext: Record<string, SyncContextPrice> = {};
  for (const [key, vatRatePercent] of Object.entries(percents)) {
    const htMillicents = htMillicentsOf(publicTtcCents, vatRatePercent);
    if (htMillicents !== null) {
      byContext[key] = { vatRatePercent, htMillicents };
    }
  }
  return byContext;
}

/** Du domaine au fil : seul le `readonly` tombe, surtout pas `incomplete`. */
function labelsOf(projection: IncoProjection): SyncAllergenLabels {
  return {
    labels: projection.labels.map((entry) => ({ category: entry.category, label: entry.label })),
    incomplete: projection.incomplete,
  };
}

/**
 * Le taux du contexte **B2B** — cette projection EST ce canal, donc elle nomme
 * sa clé. Elle lisait le taux « à emporter » faute de mieux : un emprunt que
 * rien ne signalait et qu'aucun écran ne permettait de corriger.
 *
 * `null` quand le contexte n'est pas réglé : la plateforme écarte alors
 * l'article de sa boutique plutôt que de supposer un taux.
 */
export function vatOf(percents: CategoryVatPercents): number | null {
  return percents[B2B_CONTEXT_KEY] ?? null;
}
