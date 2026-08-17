import type { CatalogSnapshot } from "@lfd/catalog-sync";

/** Ce qu'une ingestion a réellement changé, pour que l'appelant puisse le dire. */
export interface IngestionOutcome {
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly acceptedCategories: number;
  /** Les SKU présents avant, absents du snapshot — donc retirés de la vente. */
  readonly removedSkus: readonly string[];
}

/**
 * Port d'**écriture** du catalogue reçu.
 *
 * Séparé du port de lecture (ISP) : l'ingestion écrit tout et ne lit rien pour
 * son métier ; le checkout lit et n'écrit jamais. Un seul port fat obligerait le
 * chemin de paiement à dépendre de méthodes capables de réécrire le catalogue.
 */
export abstract class CatalogIngestionRepository {
  /**
   * Applique un snapshot **complet**.
   *
   * Contrat non négociable : les articles maintenus sont **mis à jour**, jamais
   * supprimés puis recréés. La table des décisions locales cascade depuis les
   * articles ; une ingestion en « table rase » effacerait donc tous les prix B2B
   * sans un mot.
   */
  abstract apply(snapshot: CatalogSnapshot): Promise<IngestionOutcome>;
}

/** Un article vendable, prix **résolu** : la décision locale a déjà gagné. */
export interface ResolvedCatalogItem {
  readonly sku: string;
  readonly name: string;
  /** Prix HT en centimes réellement applicable — celui du B2B s'il existe. */
  readonly unitPriceCents: number;
  /** Le prix du PIM, gardé pour que l'écran puisse montrer l'écart. */
  readonly pimPriceCents: number;
  readonly vatRate: number;
  readonly categoryId: string;
  readonly categoryName: string;
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
