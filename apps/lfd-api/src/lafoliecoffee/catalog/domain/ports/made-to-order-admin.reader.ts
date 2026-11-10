import type {
  ArticleReservationView,
  CompanyReservedArticlesView,
  MadeToOrderMarkView,
} from "@lfd/contracts";

/**
 * Port de **lecture** du réglage sur mesure, pour le back-office (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, § 7, lot L1a).
 * Distinct de `CatalogReader` : la boutique ne lit pas ce port, et le mur qui
 * lira la réservation pour elle (L1b) vivra dans son lecteur à elle.
 */
export abstract class MadeToOrderAdminReader {
  /** Les articles en vente qui portent un réglage : sur mesure, ou au moins une réservation. */
  abstract marks(): Promise<MadeToOrderMarkView[]>;

  /** Le réglage d'un article en vente, sociétés nommées ; `null` s'il n'est plus au catalogue. */
  abstract ofArticle(sku: string): Promise<ArticleReservationView | null>;

  /**
   * Les articles réservés à une société, et à son principal ; `null` si la
   * société n'existe pas.
   */
  abstract ofCompany(companyId: string): Promise<CompanyReservedArticlesView | null>;
}
