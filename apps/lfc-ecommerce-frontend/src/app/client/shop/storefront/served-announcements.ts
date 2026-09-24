import type { PublicStorefrontContent, PublicStorefrontPageView } from '@lfd/contracts';

/**
 * **Une annonce d'opération ne paraît que si le catalogue sert l'opération**
 * (D11 de `documentation/order/architecture-operations-datees.md`).
 *
 * Le serveur de la vitrine omet déjà une annonce hors fenêtre ou hors
 * clientèle ; il ne sait pas, lui, si le rayon `op:<key>` a quelque chose à
 * montrer. Le catalogue le sait — il ne sert une opération que si elle porte un
 * article de la boutique (`ShopCatalogueView.operations`). Une annonce qui
 * ouvrirait un rayon absent de la barre est donc écartée ici ; un objet qui n'a
 * plus rien à défiler rend ses cases au rayon (`isRenderable`), comme
 * aujourd'hui.
 *
 * La page d'origine est rendue telle quelle quand rien n'est écarté : la
 * grille compare par référence.
 */
export function withServedAnnouncements(
  page: PublicStorefrontPageView,
  served: (operationKey: string) => boolean,
): PublicStorefrontPageView {
  const shown = (content: PublicStorefrontContent): boolean => {
    if (content.kind !== 'info') {
      return true;
    }
    const key = content.operationKey ?? null;
    return key === null || served(key);
  };
  if (page.objects.every((object) => object.contents.every(shown))) {
    return page;
  }
  return {
    ...page,
    objects: page.objects.map((object) => ({ ...object, contents: object.contents.filter(shown) })),
  };
}
