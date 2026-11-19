import type { LocalizedText } from "@lfd/pim-contracts";

/** Un ingrédient cité par une fiche, avec l'appellation qu'il revendique. */
export interface ComposedIngredient {
  readonly key: string;
  readonly name: LocalizedText;
  readonly appellation: { readonly code: string; readonly label: LocalizedText } | null;
}

/**
 * **Ce qu'une fiche cite, dans son ordre d'affichage** — la clé, le nom et
 * l'appellation de chaque ingrédient, et rien d'autre.
 *
 * Même montage que `CitedAllergensReader` : déclaré et implémenté par la
 * provenance, qui possède `product_ingredient` ; le catalogue le lit sans
 * toucher ses tables. Un port à part (ISP) : la lignée d'une fiche n'a besoin
 * ni des allergènes ni des usages que rend `IngredientRepository.ofProduct`.
 */
export abstract class ProductCompositionReader {
  abstract compositionOf(productId: string): Promise<readonly ComposedIngredient[]>;
}
