/**
 * **De quelle ancienne référence cette référence de vente est-elle née ?**
 * — la seule question que le report d'un prix négocié pose au catalogue
 * (`documentation/pricing/mercuriales/l-avenant-date.md`, § 6). `null` : référence inconnue,
 * retirée, ou née autrement que d'un détachement.
 */
export abstract class SaleReferenceLineageReader {
  abstract detachedFromOf(shopSku: string): Promise<string | null>;
}
