/**
 * **Où en est une référence de vente au catalogue** — `on_sale` : vendue
 * aujourd'hui aux pros ET aux particuliers ; `pro_only` / `public_only` :
 * vendue à cette seule clientèle ; `withdrawn` : l'article a été retiré.
 * Une référence absente de la table rendue est INCONNUE.
 *
 * La clientèle est rendue depuis que Hugo a tranché (2026-10-29, L5) qu'une
 * décision pro exige la vente AUX PROS, pas seulement à quelqu'un.
 */
export type SaleReferenceStanding = "on_sale" | "pro_only" | "public_only" | "withdrawn";

/**
 * La seule question que les éditeurs de décisions tarifaires posent au
 * catalogue (`plan-pro-voit-les-declinaisons.md`, L5, 2026-10-29) : « ces
 * références sont-elles en vente, et à qui ? ».
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
