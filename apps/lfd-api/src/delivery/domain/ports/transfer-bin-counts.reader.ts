/**
 * **Combien de bacs part avec chaque transfert** (lot T3 du transfert
 * interne, Q-T4 révisée) — lu par la réception au site, qui compte les bacs
 * reçus, et par la file du comptoir. Une lecture, qui ne verrouille rien.
 *
 * Compte les bacs NON annulés du transfert, et ceux que ses commandes encore
 * portées avaient reçus avant le lot T3 (un bac par commande) : ce sont ceux
 * que l'arrêt du transfert emporte.
 */
export abstract class TransferBinCounts {
  /** Par transfert demandé ; un transfert sans bac vaut `0`. */
  abstract liveBinCounts(transferIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
