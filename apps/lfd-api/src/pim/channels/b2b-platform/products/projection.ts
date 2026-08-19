import type { CatalogSnapshot, SyncCategory, SyncProduct, SyncVariant } from "@lfd/catalog-sync";
import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";

import type { ChannelCategory } from "../../../catalogue/domain/ports/catalogue-reader.js";
import type {
  ProductRecord,
  VariantRecord,
} from "../../../catalogue/domain/ports/product.repository.js";

/**
 * Projection catalogue → snapshot de la plateforme B2B. **Pure et testable** :
 * aucun appel réseau, aucune dépendance Nest, aucune horloge — l'instant
 * d'émission est **passé**, jamais lu ici.
 *
 * C'est la pièce qui a de la valeur. Le transport changera ; ce que signifie
 * « ce produit, vendu aux pros » ne changera pas.
 */

/** Pourquoi quelque chose n'est **pas** parti. Nommé, jamais tu. */
export interface Exclusion {
  /** SKU du produit ou de la déclinaison concernée. */
  readonly sku: string;
  readonly reason:
    "variant_sans_prix" | "variant_arretee" | "produit_sans_variante_vendable" | "famille_inconnue";
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
 * Le prix est passé **à part**, déjà vérifié non nul par l'appelant.
 *
 * Le lire depuis `variant.priceCents` obligerait à un repli (`?? 0`) qui
 * transformerait un oubli de tarification en produit gratuit — précisément la
 * faute que le tri en amont existe pour empêcher. Une signature qui ne peut pas
 * mentir vaut mieux qu'un commentaire promettant qu'elle ne ment pas.
 */
function projectVariant(variant: VariantRecord, priceCents: number): SyncVariant {
  return {
    sku: variant.sku,
    name: frenchOf(variant.name),
    priceCents,
    weightGrams: variant.weightGrams,
    isDefault: variant.isDefault,
    position: variant.position,
  };
}

/**
 * Trie les déclinaisons d'un produit entre vendables et écartées.
 *
 * Deux motifs, distincts à dessein : une déclinaison **arrêtée** est une
 * décision produit, une déclinaison **sans prix** est un oubli de saisie. Les
 * confondre priverait l'écran de la seule information actionnable des deux.
 */
function sortVariants(product: ProductRecord): {
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
    sellable.push(projectVariant(variant, priceCents));
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
 * Ce qui entre malgré tout : une famille **sans régime de TVA**. Le taux part à
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
    const { sellable, excluded: rejected } = sortVariants(product);
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

/** Le taux part tel quel, `null` compris — on ne remplit jamais un trou de TVA. */
function projectCategory(category: ChannelCategory): SyncCategory {
  return {
    id: category.id,
    name: frenchOf(category.name),
    slug: frenchOf(category.slug),
    parentId: category.parentId,
    position: category.position,
    vatRatePercent: category.emporterVatPercent,
  };
}
