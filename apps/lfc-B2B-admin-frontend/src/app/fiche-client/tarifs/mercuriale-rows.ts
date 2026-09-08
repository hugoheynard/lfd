import type { CompanyPricingCategoryView, PosedMercurialeView } from '@lfd/contracts';

/**
 * **Une ligne de la mercuriale telle qu'on la relit** — l'article, ce qu'il
 * coûte au catalogue, ce qu'on lui a accordé, et l'écart entre les deux.
 *
 * Le tarif pro ne vient PAS de la mercuriale : elle ne porte que le prix
 * accordé. Il est joint depuis le tableau des prix, donc lu **au présent** —
 * comme sur la grille d'un gabarit, et pour la même raison : un tarif catalogue
 * recopié au moment de la pose vieillirait en silence, et l'écart affiché
 * serait faux sans que rien ne le signale.
 *
 * ⚠️ Conséquence à assumer : sur une mercuriale ancienne, l'écart montré est
 * celui d'aujourd'hui, pas celui du jour où on l'a signée. C'est le bon choix —
 * la question qu'on pose en rouvrant un tarif négocié est « où en est-il par
 * rapport au catalogue maintenant ».
 */
export interface MercurialeRowView {
  readonly sku: string;
  readonly productName: string;
  /** Le tarif catalogue pro d'aujourd'hui. `null` = le catalogue ne le connaît plus. */
  readonly catalogMillicents: number | null;
  readonly negotiatedMillicents: number;
  /**
   * L'écart au tarif, en points de base. **Signé** : positif = moins cher que
   * le catalogue.
   *
   * `null` sans tarif catalogue — un article que le référentiel ne pousse plus.
   * Afficher « −100 % » serait pire que rien : ce n'est pas une remise, c'est
   * une absence.
   */
  readonly gapBp: number | null;
  /** Le seuil, quand il dépasse 1 : la mercuriale vient alors d'un gabarit. */
  readonly minQuantity: number;
}

/** L'écart au tarif catalogue, signé. Positif = le client paie moins cher. */
export function gapBp(
  catalogMillicents: number | null,
  negotiatedMillicents: number,
): number | null {
  if (catalogMillicents === null || catalogMillicents <= 0) {
    return null;
  }
  return Math.round(((catalogMillicents - negotiatedMillicents) / catalogMillicents) * 10_000);
}

/**
 * Les lignes d'une mercuriale, jointes au catalogue.
 *
 * L'ordre est celui de la mercuriale — du moins cher au plus cher, tel que le
 * serveur le rend. Le retrier par nom ferait perdre ce qu'on vient chercher :
 * ce qu'on a le plus lâché.
 */
export function mercurialeRows(
  mercuriale: PosedMercurialeView,
  categories: readonly CompanyPricingCategoryView[],
): readonly MercurialeRowView[] {
  const catalogue = new Map(
    categories.flatMap((category) =>
      category.items.map((item) => [item.sku, item.canonicalMillicents] as const),
    ),
  );
  return mercuriale.lines.map((line) => {
    const catalogMillicents = catalogue.get(line.sku) ?? null;
    return {
      sku: line.sku,
      productName: line.productName,
      catalogMillicents,
      negotiatedMillicents: line.unitPriceMillicents,
      gapBp: gapBp(catalogMillicents, line.unitPriceMillicents),
      minQuantity: line.minQuantity,
    };
  });
}
