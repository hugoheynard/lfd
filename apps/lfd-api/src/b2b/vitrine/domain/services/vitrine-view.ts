import type {
  ContentLocale,
  ShopCatalogueView,
  ShopItemView,
  VitrineCatalogueView,
  VitrineItemView,
} from "@lfd/contracts";

import type { VitrineContents } from "../vitrine-contents.js";

/**
 * **La vue d'un abonné** : la vue PUBLIQUE de la boutique, moins les ensembles
 * qu'il ne reçoit pas (plan vitrine, W1′ et décision 1 du §5).
 *
 * Elle ne fait que retirer : rien ici ne lit un prix, un client ou un
 * article que la vue publique n'a pas déjà. Le filtre sur l'audience `pro`
 * est une ceinture sous les bretelles — la vue publique l'exclut déjà, et
 * l'e2e de `/vitrine` le prouve sur la route elle-même.
 */
export function vitrineCatalogueOf(
  view: ShopCatalogueView,
  contents: VitrineContents,
  language: ContentLocale,
): VitrineCatalogueView {
  const catalogue = contents.has("catalogue");
  return {
    language,
    shelves: catalogue ? view.shelves : [],
    items: catalogue
      ? view.items.filter((item) => item.audience !== "pro").map((item) => itemFor(item, contents))
      : [],
    operations: contents.has("operations") ? view.operations : [],
  };
}

/**
 * Un article, sans `isFeatured` si l'abonné ne reçoit pas les
 * « Incontournables », sans `operation` s'il ne reçoit pas les opérations :
 * une case décochée retire l'ensemble, jusqu'au renvoi qui y mène.
 */
function itemFor(item: ShopItemView, contents: VitrineContents): VitrineItemView {
  const { isFeatured, operation, ...rest } = item;
  return {
    ...rest,
    ...(contents.has("featured") ? { isFeatured } : {}),
    ...(contents.has("operations") && operation !== undefined ? { operation } : {}),
  };
}

/** Les textes d'une langue, vides si l'abonné ne reçoit pas les textes. */
export function vitrineTextsOf(
  texts: Readonly<Record<string, string>>,
  contents: VitrineContents,
): Readonly<Record<string, string>> {
  return contents.has("texts") ? texts : {};
}
