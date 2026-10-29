/**
 * **Où en est une référence de vente au catalogue** — `on_sale` : vendue
 * aujourd'hui à au moins une clientèle ; `withdrawn` : l'article a été retiré.
 * Une référence absente de la table rendue est INCONNUE.
 */
export type SaleReferenceStanding = "on_sale" | "withdrawn";

/**
 * La seule question que les éditeurs de décisions tarifaires posent au
 * catalogue (`plan-pro-voit-les-declinaisons.md`, L5, 2026-10-29) : « ces
 * références sont-elles en vente ? ».
 *
 * Par SKU de VENTE, résolu par le même chemin que la caisse : une décision
 * vise ce qui se vend, et le défaut se vend sous le SKU de son produit
 * (`shopSkuOf`). Un lecteur qui comparerait au SKU produit en direct
 * divergerait de la caisse le jour où le défaut se vendra sous son propre SKU.
 */
export abstract class SaleReferenceReader {
  abstract standingOf(
    shopSkus: readonly string[],
  ): Promise<ReadonlyMap<string, SaleReferenceStanding>>;
}
