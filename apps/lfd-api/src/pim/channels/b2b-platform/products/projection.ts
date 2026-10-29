import type {
  SyncAllergenLabels,
  SyncAllergenTexts,
  SyncContextPrice,
  SyncMedia,
  SyncVariant,
} from "@lfd/catalog-sync";
import { htMillicentsOf } from "@lfd/pim-contracts";

import type { AllergenNaming } from "../../../allergens/domain/services/allergen-naming.js";
import type { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import { effectiveAllergens } from "../../../catalogue/product/domain/services/effective-allergens.js";
import type { CatalogTranslations } from "./translations.js";
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
  /** Les traductions de la ligne — vides quand rien n'est traduit, ou rien d'écrit. */
  readonly noteTranslations: CatalogTranslations;
  readonly image: SyncMedia | null;
  /** La vignette de rayon — `null` si la fiche n'en désigne pas. */
  readonly thumbnail: SyncMedia | null;
}

/** Le français est la langue de la plateforme ; l'aplatissement se fait ici. */
function frenchOf(text: { readonly fr: string }): string {
  return text.fr;
}

/**
 * Les prix sont passés **à part**, déjà convertis et vérifiés par l'appelant.
 *
 * Les lire depuis `variant.priceCents` obligerait à un repli (`?? 0`) qui
 * transformerait un oubli de tarification en produit gratuit — précisément la
 * faute que le tri en amont existe pour empêcher. Un prix absent traverse
 * `null` — « pas vendable à cette audience », jamais zéro — et
 * `publicByContext` est alors vide (2026-10-27,
 * `plan-prix-manquant-non-bloquant.md`).
 *
 * Le prix pro est **hors taxe**, quelle que soit l'assiette de la déclinaison :
 * la plateforme professionnelle facture en HT de bout en bout, et la frontière
 * du TTC s'arrête à ce fichier. Cf.
 * `documentation/pricing/architecture-prix-ancre-ttc.md` § 4.
 */
export function projectVariant(
  variant: VariantRecord,
  htPriceMillicents: number | null,
  vatRatePercent: number | null,
  publicTtcCents: number | null,
  percents: CategoryVatPercents,
  naming: AllergenNaming,
  context: AllergenContext,
): SyncVariant {
  const served = effectiveAllergens(variant.allergenSheet, context.cited, context.catalogueUnion);
  return {
    // L'identifiant traverse depuis la v7 : une règle de rang « déclinaison »
    // vise celui-ci, et le récepteur ne pourrait pas la rattacher au SKU seul.
    id: variant.id,
    sku: variant.sku,
    name: frenchOf(variant.name),
    priceMillicents: htPriceMillicents,
    publicTtcCents,
    publicByContext: publicTtcCents === null ? {} : publicPricesOf(publicTtcCents, percents),
    weightGrams: variant.weightGrams,
    // Informatifs, recopiés tels que saisis (`plan-prix-au-kilo.md`) : rien
    // ne les calcule ici, rien ne les lit pour tarifer de l'autre côté.
    proPricePerKgMillicents: variant.proPricePerKgMillicents,
    publicPricePerKgTtcCents: variant.publicPricePerKgTtcCents,
    // L'unité de vente et ses termes (v14, `vente-au-poids.md`) :
    // recopiés tels que saisis, déjà validés par la déclinaison.
    saleUnit: variant.saleUnit,
    weightMinGrams: variant.weightMinGrams,
    weightStepGrams: variant.weightStepGrams,
    // La quantité minimale EFFECTIVE (v15, `plan-quantite-minimale.md`) :
    // l'instantané de l'agrégat a déjà résolu l'héritage du défaut et vidé
    // celle d'une déclinaison au poids. Copiée : le fil ne partage rien.
    minQuantities: {
      pro: { ...variant.minQuantities.pro },
      public: { ...variant.minQuantities.public },
    },
    isDefault: variant.isDefault,
    position: variant.position,
    vatRatePercent,
    allergens: [...served.allergens],
    allergenLabels: labelsOf(naming.source, served.allergens),
    mayContain: [...served.mayContain],
    allergensPrecautionary: served.precautionary,
    allergenTexts: allergenTextsOf(naming, served.allergens, served.mayContain),
  };
}

/**
 * **Ce que la projection sait des allergènes au-delà de la déclinaison** —
 * résolu en amont, une fois par projection, et passé ici pour qu'elle reste
 * pure.
 *
 * Le fil porte l'état SERVI (`effectiveAllergens`, règles A et B de
 * `plan-allergenes-jamais-bloquants.md`), jamais la déclaration enregistrée.
 * Sous B, `allergens` porte les seuls cités — vide si la composition est
 * muette — et c'est `allergensPrecautionary` qui empêche le récepteur de lire
 * cette liste vide comme « aucun allergène ». Ce renversement du `null` du
 * 2026-10-27 au matin date du même jour : le fil porte désormais les traces.
 */
export interface AllergenContext {
  /** Les codes que la composition de la fiche cite (règle A). */
  readonly cited: readonly string[];
  /** L'union des allergènes déclarés du catalogue publié (règle B). */
  readonly catalogueUnion: readonly string[];
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

/**
 * **Les mentions du fil : l'annexe II, puis ce qu'on sait NOMMER hors d'elle.**
 *
 * Décision de Hugo, 2026-10-26 (Q3 du 2026-10-20 portée jusqu'au fil) : le
 * sarrasin, le maïs et la noix de coco sont connus du référentiel sans
 * obligation UE. Ils partaient en `incomplete: true` sans libellé — la
 * boutique savait qu'il y avait « un allergène en plus » sans pouvoir dire
 * lequel. Ils voyagent désormais nommés, leur code GS1 en guise de clé
 * (`category`), et `incomplete` ne se lève plus que pour un code que le
 * référentiel ne range NULLE PART (`IncoProjector.outsideAnnex().unknown`).
 */
function labelsOf(inco: IncoProjector, declared: readonly string[]): SyncAllergenLabels {
  const annex = inco.project(declared);
  const outside = inco.outsideAnnex(declared);
  return {
    labels: [
      ...annex.labels.map((entry) => ({ category: entry.category, label: entry.label })),
      ...outside.named.map((entry) => ({ category: entry.code, label: entry.label })),
    ],
    incomplete: outside.unknown.length > 0,
  };
}

/**
 * **Ce que le client lit, langue par langue** — les libellés des allergènes
 * servis, puis ceux des traces (`documentation/pim/plan-allergenes-en-boutique.md`,
 * décisions (a) et (b) de Hugo, 2026-10-27).
 *
 * Mêmes mentions que {@link labelsOf} : l'annexe II dédoublonnée (blé et seigle
 * font un seul « gluten »), puis ce qu'on sait nommer hors d'elle. Une trace
 * dont la mention est déjà parmi les allergènes n'est pas répétée — « Gluten »
 * puis « peut contenir : Gluten » se contredirait sous les yeux du client.
 */
function allergenTextsOf(
  naming: AllergenNaming,
  allergens: readonly string[],
  mayContain: readonly string[],
): Record<string, SyncAllergenTexts> {
  const texts: Record<string, SyncAllergenTexts> = {};
  for (const locale of naming.locales) {
    const inco = naming.in(locale);
    const contains = labelsOf(inco, allergens).labels;
    const shown = new Set(contains.map((entry) => entry.category));
    texts[locale] = {
      contains: contains.map((entry) => entry.label),
      mayContain: labelsOf(inco, mayContain)
        .labels.filter((entry) => !shown.has(entry.category))
        .map((entry) => entry.label),
    };
  }
  return texts;
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
