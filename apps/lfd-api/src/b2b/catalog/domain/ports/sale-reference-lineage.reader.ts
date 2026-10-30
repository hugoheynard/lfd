/**
 * **De quelles références cet article descend-il ?**
 * (`plan-pro-voit-les-declinaisons.md`, L7d-bis — les alertes).
 *
 * Un port à lui (ISP), distinct de `SaleReferenceSuccessionReader` : celui-ci
 * descend la lignée vers la référence la plus récente, celui-là la remonte
 * vers les anciennes. Seules les alertes posent cette question-ci, en lecture
 * seule.
 */
export abstract class SaleReferenceLineageReader {
  /**
   * Les ancêtres de chaque SKU demandé qui en a, du plus proche au plus
   * lointain ; un SKU sans ancêtre n'est pas dans la carte. Retirés compris.
   */
  abstract ancestorsOf(skus: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>>;
}
