/** Un article vendable, prix **résolu** : la décision locale a déjà gagné. */
export interface ResolvedCatalogItem {
  readonly sku: string;
  /**
   * Le SKU du **produit** dont cet article est une déclinaison.
   *
   * Rendu parce que les deux ne coïncident pas : le PIM dérive le SKU d'une
   * déclinaison de celui de son produit (`VIE-001` → `VIE-001-1`), alors que le
   * seed B2B vend le SKU produit. C'est la clé qui permet de comparer les deux
   * catalogues avant de basculer — sans elle, la comparaison ne verrait que
   * 92 disparitions et 92 apparitions.
   */
  readonly productSku: string;
  readonly name: string;
  /** Prix HT en centimes réellement applicable — celui du B2B s'il existe. */
  readonly unitPriceCents: number;
  /** Le prix du PIM, gardé pour que l'écran puisse montrer l'écart. */
  readonly pimPriceCents: number;
  readonly vatRate: number;
  readonly categoryId: string;
  readonly categoryName: string;
  /**
   * L'unité vendue **par défaut** du produit.
   *
   * Un produit peut avoir plusieurs déclinaisons (l'unité, le carton) ; c'est
   * celle-ci que le seed connaissait, et c'est donc elle qu'une comparaison
   * doit rapprocher. Sans ce drapeau, le carton écrase l'unité dans un index
   * par produit, et le rapport annonce qu'un croissant coûte 60 €.
   */
  readonly isDefault: boolean;
  readonly isFeatured: boolean;
}

/**
 * Port de **lecture** du catalogue, décisions locales déjà appliquées.
 *
 * Les appelants ne voient jamais les deux tables : ils voient un catalogue. La
 * composition est faite ici une seule fois — la laisser fuir donnerait autant de
 * versions de « quel prix s'applique » qu'il y a d'écrans.
 */
export abstract class CatalogReader {
  /** Un SKU, ou `null` s'il est inconnu **ou masqué**. */
  abstract findSku(sku: string): Promise<ResolvedCatalogItem | null>;
  /** Tout ce qui est vendable, masqués exclus, dans l'ordre d'affichage. */
  abstract listSellable(): Promise<ResolvedCatalogItem[]>;
}
