/**
 * Où en est la feuille d'une commande au colisage :
 *
 * - `packed` — le bac est fermé : la commande est prête ;
 * - `withdrawn` — la feuille est retirée par une annulation après l'arrêt du
 *   plan (plan A1, § 2.2).
 *
 * Une commande sans feuille, ou dont la feuille est ouverte, n'a pas d'entrée.
 */
export type OrderPackingState = "packed" | "withdrawn";

/**
 * **« Où en sont ces commandes au colisage ? »** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.1, lot A1.3) — déclaré ET implémenté par le colisage, lu par le
 * commerce : les aperçus d'annulation (fiche staff, « Mes commandes ») disent
 * « non annulable » quand le bac est fermé, et la Supervision compte les
 * feuilles retirées. Même figure que {@link PackedResuppliesReader}.
 *
 * Une LECTURE sans verrou : un aperçu, pas une promesse — le geste relit la
 * feuille sous son verrou, par `PackingWithdrawalDesk`. Par lot : « Mes
 * commandes » et la Supervision lisent plusieurs commandes.
 *
 * `packing → b2b` reste interdit : le colisage ne sait pas qui le lit.
 */
export abstract class OrderPackingStateReader {
  /**
   * L'état de chaque commande demandée qui a une feuille fermée ou retirée ;
   * une commande absente de la carte n'est ni l'un ni l'autre. Une commande
   * qui a des feuilles sur plusieurs journées (réouverture puis report) est
   * lue à sa DERNIÈRE journée.
   */
  abstract packedAmong(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderPackingState>>;
}
