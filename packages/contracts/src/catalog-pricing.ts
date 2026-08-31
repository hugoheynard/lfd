/**
 * **Ce qui suffit à facturer une ligne** — et qui ne se sépare jamais.
 *
 * Un prix seul n'est pas une ligne facturable : il dit ce qu'on DEMANDE, pas ce
 * qu'on FACTURE. Le taux qui l'accompagne fait la différence entre les deux, et
 * il bouge — par contexte de vente, par dérogation de fiche, et par la loi.
 *
 * Le couple existait déjà partout, à plat et redéclaré à chaque fois : sur la
 * ligne de commande (`order_lines.unit_price_millicents` + `vat_rate`), sur
 * l'article du catalogue, sur le fil du PIM. Il manquait à un seul endroit —
 * `catalog_price_history`, qui versionnait le prix SANS le taux, si bien qu'un
 * prix historique n'y était pas relisible comme une ligne facturable. C'est
 * cette absence qui a fait nommer le couple plutôt que de le recopier une
 * quatrième fois.
 *
 * Il ne porte **ni nom d'article ni famille** : ce sont des informations
 * d'affichage, elles changent sans que rien ne soit refacturé, et les mettre ici
 * ferait qu'un devis figé se contredirait avec le catalogue au premier
 * renommage.
 */
export interface CatalogPricing {
  /**
   * Le SKU de l'unité **vendue**.
   *
   * Aujourd'hui c'est le SKU du PRODUIT : la plateforme B2B vend le produit et
   * résout sa déclinaison par défaut (`findDefaultByProductSku`), si bien que
   * `ProductCatalogReader` expose déjà `sku: item.productSku`. Les tables, elles,
   * portent les deux — l'article (`VIE-007-1`) et son produit (`VIE-007`).
   *
   * ⚠️ Le jour où la boutique vendra les déclinaisons — un carton de 50 et
   * l'unité sont deux lignes à deux tarifs — cette clé devra descendre d'un
   * cran, et ce champ est le premier endroit à reprendre.
   * `@lfd/catalog-sync` annonce déjà cette bascule.
   */
  readonly sku: string;
  /** Prix unitaire **hors taxe professionnel**, en millicentimes (10⁻⁵ €). */
  readonly unitPriceMillicents: number;
  /**
   * Taux de TVA en %, ex. `5.5`.
   *
   * `null` = **on ne sait pas facturer** — famille non réglée dans le PIM, ou
   * trace antérieure à l'historisation du taux. Les deux se lisent pareil, et
   * c'est voulu : un taux inventé sur une trace ancienne finirait dans un devis.
   */
  readonly vatRatePercent: number | null;
}
