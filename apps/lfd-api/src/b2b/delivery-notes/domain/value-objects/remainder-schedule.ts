import { InvalidDeliveryNoteRemainderError } from "../errors/delivery-note-errors.js";

/** Un jour civil `AAAA-MM-JJ` réel (le 2026-02-30 n'en est pas un). */
function isCivilDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

/**
 * **Le rang et le jour d'un reliquat** (plan E7, lot L1, choix 2 et 10) : un
 * BL de rang > 1, servi un jour civil au plus tôt égal au jour demandé de sa
 * commande. Le rang 1 n'a pas de jour propre — il suit la commande.
 *
 * « Jamais un jour fermé » (choix 10) ne se juge pas ici : le domaine du BL
 * ignore le fournil ; la décision (lot L8) le vérifie avant d'appeler.
 */
export class RemainderSchedule {
  private constructor(
    readonly rank: number,
    readonly serviceDay: string,
  ) {}

  /**
   * @throws {InvalidDeliveryNoteRemainderError} rang non entier ou ≤ 1, jour
   *   absent ou mal formé, jour antérieur à celui de la commande.
   */
  static of(
    orderNumber: string,
    rank: number,
    serviceDay: string,
    orderDay: string,
  ): RemainderSchedule {
    if (!Number.isInteger(rank) || rank <= 1) {
      throw new InvalidDeliveryNoteRemainderError(
        orderNumber,
        `le rang ${rank} n'est pas celui d'un reliquat (entier au-delà de 1 ; le rang 1 est la commande elle-même)`,
      );
    }
    if (!isCivilDay(serviceDay)) {
      throw new InvalidDeliveryNoteRemainderError(
        orderNumber,
        `le jour de service « ${serviceDay} » n'est pas une date AAAA-MM-JJ`,
      );
    }
    if (!isCivilDay(orderDay)) {
      throw new InvalidDeliveryNoteRemainderError(
        orderNumber,
        `le jour demandé de la commande « ${orderDay} » n'est pas une date AAAA-MM-JJ`,
      );
    }
    if (serviceDay < orderDay) {
      throw new InvalidDeliveryNoteRemainderError(
        orderNumber,
        `le jour de service ${serviceDay} précède le jour demandé de la commande (${orderDay})`,
      );
    }
    return new RemainderSchedule(rank, serviceDay);
  }
}
