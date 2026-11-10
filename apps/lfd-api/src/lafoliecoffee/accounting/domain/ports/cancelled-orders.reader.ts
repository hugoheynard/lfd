/**
 * Parmi ces commandes, celles qui ont été **annulées** — rendues par leur
 * numéro, pour nommer le refus du dépôt (plan §3).
 */
export abstract class CancelledOrdersReader {
  abstract cancelledAmong(orderIds: readonly string[]): Promise<readonly string[]>;
}
