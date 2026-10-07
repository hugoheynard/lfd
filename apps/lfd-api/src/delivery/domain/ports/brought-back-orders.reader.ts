/** Une commande rapportée (B3, LB-Q2) : l'instant de la décision « Rapporter ». */
export interface BroughtBackOrderRow {
  readonly orderId: string;
  readonly broughtBackAt: Date;
}

/**
 * Port de **lecture** des commandes RAPPORTÉES
 * (`documentation/livraisons/tournees/decisions-par-defaut-2026-10-02.md`, § 4, lot
 * RL1) — un port à part de `DeliveryRoundsReader` (ISP) : la composition du
 * jour, l'affectation et le chronométrage le lisent, la feuille de route non.
 *
 * Le fait vient de la décision à la porte (`delivery.stop_decision`, réponse
 * `bring_back`) — par un commercial ou par réglage (B3 bis).
 */
export abstract class BroughtBackOrdersReader {
  /**
   * Les commandes rapportées qui n'ont été REPLACÉES dans aucune tournée
   * depuis : aucun arrêt non retiré créé après la décision. Une par commande,
   * la dernière décision ; par instant croissant.
   */
  abstract awaitingPlacement(): Promise<readonly BroughtBackOrderRow[]>;

  /** Parmi ces commandes, la dernière fois que chacune a été rapportée ; les autres sont absentes. */
  abstract lastAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, Date>>;
}
