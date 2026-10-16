/**
 * **Lesquels de ces articles sont en vente ?** — ce que l'écran des
 * opérations demande au catalogue du commerce pour dire « en boutique :
 * l'annonce seule, sans produit » (lot 3).
 *
 * Distinct d'`OperationSkuCatalogue` (ISP) : celui-là demande si un SKU
 * EXISTE, pour refuser une saisie ; celui-ci s'il SE VEND, pour prévenir.
 */
export abstract class OperationSaleReader {
  /** Ceux de ces SKU (du catalogue) servis à une boutique au moins. */
  abstract sellingAmong(skus: readonly string[]): Promise<ReadonlySet<string>>;
}
