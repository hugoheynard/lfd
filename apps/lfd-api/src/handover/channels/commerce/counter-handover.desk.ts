/**
 * **Le guichet du retrait pour un départ décidé au comptoir** (plan
 * `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.2,
 * étapes 2 et 5 — Hugo, 2026-11-03).
 *
 * Déclaré ET implémenté par le retrait, appelé par le commerce DANS la
 * transaction de sa décision, après le verrou de la commande (« commande,
 * puis fiche ») : la matrice n'ouvre `b2b → handover` que par ce dossier.
 *
 * Deux gestes, et leur ordre est le contrat : `vet` d'abord, AVANT toute
 * écriture du commerce — un refus (non réglée, retenue, annulée, déjà
 * retirée, livraison, autre jour, QR d'une autre commande) ne laisse ni
 * signal, ni décision, ni BL réécrit ; `handOver` en dernier, la remise
 * elle-même (l'auteur de la session), dont le fait `handover.handed_over`
 * part avec la décision ou pas du tout.
 *
 * `token` : le jeton du QR lu au scan, ou `null` (Hugo, 2026-11-03). Avec un
 * jeton de CETTE commande, la remise est gravée `scan` ; sans, `manual`.
 */
export abstract class CounterHandoverDesk {
  /**
   * La commande est-elle à la portée du comptoir, et remettable ? Rien
   * n'est écrit.
   *
   * @throws {CounterOutOfReachError} livraison, ou autre jour que celui du comptoir (403).
   * @throws {HandoverRefusedError} l'état interdit le retrait (409).
   * @throws {HandoverTokenNotFoundError} le jeton ne désigne aucune commande (404).
   * @throws {CounterTokenMismatchError} le jeton désigne une autre commande (409).
   */
  abstract vet(orderId: string, by: string, token: string | null): Promise<void>;

  /**
   * Remet la commande (rang 1), dans l'unité de travail de l'appelant.
   *
   * @throws {HandoverRefusedError} l'état l'interdit, ou un autre poste a gagné.
   * @throws {HandoverTokenNotFoundError} @throws {CounterTokenMismatchError} comme `vet`.
   */
  abstract handOver(orderId: string, by: string, token: string | null): Promise<void>;
}
