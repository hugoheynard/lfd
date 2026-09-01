import type {
  CatalogSnapshot,
  SyncAllergenLabels,
  SyncCategory,
  SyncProduct,
  SyncVariant,
} from "@lfd/catalog-sync";
import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";
import { htMillicentsOf, proPriceFromPublic, type B2bExclusionReason } from "@lfd/pim-contracts";

import type {
  IncoProjection,
  IncoProjector,
} from "../../../allergens/domain/services/inco-projector.js";
import type {
  CategoryVatPercents,
  ChannelCategory,
} from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import {
  sellsContext,
  type SalesChannels,
} from "../../../catalogue/shared/domain/value-objects/sales-channels.js";

/**
 * La clé du contexte que CE canal facture. Une constante nommée plutôt qu'une
 * chaîne au fil du code : elle désigne une ligne du registre, et le jour où elle
 * ne désigne plus rien, il n'y a qu'un endroit à corriger.
 */
const B2B_CONTEXT_KEY = "b2b";
import type {
  ProductRecord,
  VariantRecord,
} from "../../../catalogue/product/domain/ports/product.repository.js";

/**
 * Projection catalogue → snapshot de la plateforme B2B. **Pure et testable** :
 * aucun appel réseau, aucune dépendance Nest, aucune horloge — l'instant
 * d'émission est **passé**, jamais lu ici.
 *
 * C'est la pièce qui a de la valeur. Le transport changera ; ce que signifie
 * « ce produit, vendu aux pros » ne changera pas.
 */

/**
 * Pourquoi quelque chose n'est **pas** parti. Nommé, jamais tu.
 *
 * Le motif vient du CONTRAT (`B2bExclusionReason`) au lieu d'être redéclaré
 * ici. C'était un synonyme, et il avait dérivé : le domaine produisait
 * `canal_ferme` que le contrat ignorait, donc l'écran de publication affichait
 * un motif vide pour une fiche écartée. Un alias, lui, ne peut pas diverger —
 * c'est le compilateur qui tient les deux bouts.
 */
export interface Exclusion {
  /** SKU du produit ou de la déclinaison concernée. */
  readonly sku: string;
  readonly reason: B2bExclusionReason;
}

export interface Projection {
  readonly snapshot: CatalogSnapshot;
  /**
   * Ce qui a été écarté, avec son motif.
   *
   * Un push qui tait ses exclusions laisse croire que 92 produits sont partis
   * quand 89 le sont. Le silence sur une troncature est le mensonge le plus
   * facile à écrire et le plus long à découvrir.
   */
  readonly excluded: readonly Exclusion[];
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
 * `documentation/pim/architecture-prix-ancre-ttc.md` § 4.
 */
function projectVariant(
  variant: VariantRecord,
  htPriceMillicents: number,
  vatRatePercent: number | null,
  inco: IncoProjector,
): SyncVariant {
  // Le `null` est transmis TEL QUEL : c'est la différence entre « rien n'a été
  // déclaré » et « rien ne s'y trouve », et elle ne se reconstitue pas en aval.
  // Les mentions le suivent — « aucune fiche » ne se lit jamais « aucun
  // allergène ». Les codes, eux, restent le stockage canonique ; leur copie
  // n'est que le passage du `readonly` du domaine au tableau du schéma de fil.
  const declared = variant.allergens;
  return {
    sku: variant.sku,
    name: frenchOf(variant.name),
    priceMillicents: htPriceMillicents,
    weightGrams: variant.weightGrams,
    isDefault: variant.isDefault,
    position: variant.position,
    vatRatePercent,
    allergens: declared === null ? null : [...declared],
    allergenLabels: declared === null ? null : labelsOf(inco.project(declared)),
  };
}

/** Du domaine au fil : seul le `readonly` tombe, surtout pas `incomplete`. */
function labelsOf(projection: IncoProjection): SyncAllergenLabels {
  return {
    labels: projection.labels.map((entry) => ({ category: entry.category, label: entry.label })),
    incomplete: projection.incomplete,
  };
}

/**
 * Trie les déclinaisons d'un produit entre vendables et écartées, et **convertit
 * en hors taxe** au passage.
 *
 * Trois motifs, distincts à dessein : une déclinaison **arrêtée** est une
 * décision produit, une déclinaison **sans prix** est un oubli de saisie, et une
 * déclinaison **ancrée au TTC sans taux** est un prix qu'on ne sait pas
 * convertir. Les confondre priverait l'écran de la seule information
 * actionnable des trois — et le dernier envoie ouvrir un autre écran que les
 * deux premiers.
 *
 * La conversion se fait ICI plutôt qu'en aval : c'est le dernier endroit qui
 * connaît encore l'assiette. Passé ce point, tout est HT — y compris pour la
 * comparaison de parité, qui rejoue cette même projection.
 */
function sortVariants(
  product: ProductRecord,
  vatRatePercent: number | null,
  proRatioBp: number,
  inco: IncoProjector,
): {
  sellable: SyncVariant[];
  excluded: Exclusion[];
} {
  const sellable: SyncVariant[] = [];
  const excluded: Exclusion[] = [];

  for (const variant of product.variants) {
    if (variant.isDiscontinued) {
      excluded.push({ sku: variant.sku, reason: "variant_arretee" });
      continue;
    }
    const priceCents = variant.priceCents;
    if (priceCents === null) {
      excluded.push({ sku: variant.sku, reason: "variant_sans_prix" });
      continue;
    }
    // **La chaîne, dans son ordre.** Le prix stocké est un prix public TTC ; le
    // rapport en fait un prix pro TTC ; le taux du canal en fait un hors taxe.
    //
    // Le prix pro est arrondi AU CENTIME avant la division, et c'est délibéré :
    // c'est un prix, pas un intermédiaire de calcul. Garder le rationnel exact
    // jusqu'au bout ferait diverger d'un centime le hors taxe poussé et celui
    // que la fiche affiche sous le prix pro — deux nombres qu'un client peut
    // recompter. L'écran fait exactement la même chose, avec la même fonction.
    const proTtcCents = proPriceFromPublic(priceCents, proRatioBp);
    // Un prix d'étiquette sans taux ne se déduit pas. On l'écarte plutôt que
    // d'inventer un taux : une conversion approximative facturerait un montant
    // que personne n'a décidé, et rien ne le signalerait ensuite.
    const htMillicents = htMillicentsOf(proTtcCents, vatRatePercent);
    if (htMillicents === null) {
      excluded.push({ sku: variant.sku, reason: "variant_sans_taux" });
      continue;
    }
    sellable.push(projectVariant(variant, htMillicents, vatRatePercent, inco));
  }

  return { sellable, excluded };
}

/**
 * Construit le snapshot à partir des produits **déjà filtrés** par l'appartenance
 * au canal.
 *
 * Ce qui n'entre pas :
 * - une déclinaison arrêtée ou non tarifée ;
 * - un produit dont plus aucune déclinaison n'est vendable ;
 * - un produit dont la famille est **inconnue** — on ne range pas au hasard.
 *
 * Ce qui entre malgré tout : une famille **sans taux de TVA**. Le taux part à
 * `null` plutôt que d'exclure le produit, parce que le prix canonique a de la
 * valeur sans lui — un écran de paramétrage n'a pas besoin de savoir facturer.
 * Le refus n'a pas disparu, il est déplacé là où il compte : la plateforme
 * écarte de sa BOUTIQUE tout article sans taux, plutôt qu'un défaut à 5,5 %.
 *
 * Les familles rendues sont **celles réellement utilisées** : pousser un rayon
 * vide oblige la plateforme à en gérer l'affichage sans jamais rien y ranger.
 */
export function projectCatalog(
  products: readonly ProductRecord[],
  categories: readonly ChannelCategory[],
  /**
   * Le taux effectif **par produit**, résolu en amont (dérogation de la fiche
   * par-dessus celle de sa famille). Passé plutôt que recalculé : la règle
   * n'a qu'une écriture, et cette fonction reste pure.
   */
  vatByProduct: ReadonlyMap<string, CategoryVatPercents>,
  /**
   * Où chaque fiche se vend **réellement**, résolu en amont de la même façon.
   *
   * Ce que ce canal en fait : il écarte ce qui n'est pas vendu chez lui. Écarté
   * du snapshot, l'article est **retiré de la boutique** au push suivant —
   * l'ingestion supprime ce qui n'arrive plus.
   */
  channelsByProduct: ReadonlyMap<string, SalesChannels>,
  /**
   * Le **rapport prix pro / prix public**, en points de base (9 000 = 90 %).
   *
   * Obligatoire, et sans valeur de repli. Un défaut à 10 000 affirmerait « le
   * pro paie le prix public » — une phrase que personne n'a prononcée, et le
   * référentiel a déjà retiré un défaut de ce genre (`DEFAULT_FOOD_VAT_RATE`).
   * Une branche `null` ici serait pire encore : elle ne serait jamais prise sur
   * une maison correctement réglée, donc jamais éprouvée, et elle facturerait
   * le plein tarif le jour où elle le serait. C'est l'APPELANT qui refuse de
   * pousser tant que rien n'est réglé — voir `B2bCatalogFeedProjection`.
   */
  proRatioBp: number,
  /**
   * Le référentiel d'allergènes, lu **une fois par push** et passé ici (D6) —
   * reçu plutôt que cherché, comme le taux et le rapport pro, ce qui garde
   * cette projection pure. Le récepteur n'a plus de quoi traduire un code GS1
   * en mention d'étiquette : le référentiel est une donnée du PIM.
   */
  inco: IncoProjector,
  generatedAt: string,
): Projection {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const excluded: Exclusion[] = [];
  const kept: SyncProduct[] = [];
  /** Familles réellement utilisées : pousser un rayon vide n'apprend rien. */
  const usedCategories = new Set<string>();

  for (const product of products) {
    const category = byId.get(product.categoryId);
    if (category === undefined) {
      excluded.push({ sku: product.sku, reason: "famille_inconnue" });
      continue;
    }
    // La matrice DÉCIDE, elle ne se contente plus de décrire : une fiche qu'on
    // ne vend pas aux professionnels n'entre pas dans leur boutique, et celle
    // qui y était en sort au push suivant.
    if (!sellsContext(channelsByProduct.get(product.id) ?? [], B2B_CONTEXT_KEY)) {
      excluded.push({ sku: product.sku, reason: "canal_ferme" });
      continue;
    }
    // Résolu ICI, une fois par produit : chaque article part avec SON taux,
    // et le récepteur n'a plus à rejoindre une famille pour savoir facturer.
    const { sellable, excluded: rejected } = sortVariants(
      product,
      vatOf(vatByProduct.get(product.id) ?? {}),
      proRatioBp,
      inco,
    );
    excluded.push(...rejected);

    if (sellable.length === 0) {
      excluded.push({
        sku: product.sku,
        reason: "produit_sans_variante_vendable",
      });
      continue;
    }

    usedCategories.add(category.id);
    kept.push({
      id: product.id,
      sku: product.sku,
      name: frenchOf(product.name),
      categoryId: product.categoryId,
      kind: product.kind,
      variants: sellable,
    });
  }

  return {
    snapshot: {
      version: CATALOG_SNAPSHOT_VERSION,
      generatedAt,
      categories: categories
        .filter((category) => usedCategories.has(category.id))
        .map(projectCategory),
      products: kept,
    },
    excluded,
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
function vatOf(percents: CategoryVatPercents): number | null {
  return percents[B2B_CONTEXT_KEY] ?? null;
}

/** Le taux part tel quel, `null` compris — on ne remplit jamais un trou de TVA. */
function projectCategory(category: ChannelCategory): SyncCategory {
  return {
    id: category.id,
    name: frenchOf(category.name),
    slug: frenchOf(category.slug),
    parentId: category.parentId,
    position: category.position,
    vatRatePercent: vatOf(category.vatByContext),
  };
}
