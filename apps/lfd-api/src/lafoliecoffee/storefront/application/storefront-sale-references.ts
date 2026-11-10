import type { PublicStorefrontPageView } from "@lfd/contracts";

/** Les références produit que les tuiles de la page désignent. */
export function tileProductSkusOf(page: PublicStorefrontPageView): readonly string[] {
  return [
    ...new Set(
      page.objects.flatMap((object) =>
        object.contents.flatMap((content) => (content.kind === "product" ? [content.sku] : [])),
      ),
    ),
  ];
}

/**
 * **Chaque tuile sous la référence que la boutique vend**
 * (`plan-defaut-sous-sa-reference.md`, L3).
 *
 * L'éditeur enregistre une FICHE (sa référence produit) ; la boutique cherche
 * la tuile parmi les articles qu'elle vend, et le défaut se vend sous sa propre
 * référence depuis la bascule. Une fiche sans défaut en vente garde sa
 * référence : la boutique ne la trouve pas, et la tuile rend ses cases au
 * rayon — ce qu'elle faisait déjà pour un article retiré.
 */
export function withSaleReferences(
  page: PublicStorefrontPageView,
  saleSkuOf: ReadonlyMap<string, string>,
): PublicStorefrontPageView {
  return {
    ...page,
    objects: page.objects.map((object) => ({
      ...object,
      contents: object.contents.map((content) =>
        content.kind === "product"
          ? { ...content, sku: saleSkuOf.get(content.sku) ?? content.sku }
          : content,
      ),
    })),
  };
}
