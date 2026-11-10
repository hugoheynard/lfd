import { InvalidDeliveryNoteNumberError } from "../errors/delivery-note-errors.js";

/** Le préfixe d'un numéro de commande, retiré du numéro de BL. */
const ORDER_NUMBER_PREFIX = "ORD-";

/** Le préfixe d'un numéro de bon de livraison. */
const DELIVERY_NOTE_PREFIX = "BL";

/**
 * **Le numéro humain d'un bon de livraison** : `BL-<numéro de commande sans
 * ORD->-<rang>` — `ORD-1042` donne `BL-1042-1`, `BL-1042-2` (Q-E4, Hugo,
 * 2026-10-24). Un numéro à l'ancien format suit la même règle, sans cas à
 * part : `ORD-MV84O2XA-Y9W3` donne `BL-MV84O2XA-Y9W3-1` (Q-E1-1).
 *
 * Un BL annulé garde son numéro : un numéro ne se réemploie jamais.
 */
export class DeliveryNoteNumber {
  private constructor(readonly value: string) {}

  /** Le numéro de commande permet-il de numéroter un BL ? `ORD-` suivi d'au moins un caractère. */
  static canNumber(orderNumber: string): boolean {
    return (
      orderNumber.startsWith(ORDER_NUMBER_PREFIX) && orderNumber.length > ORDER_NUMBER_PREFIX.length
    );
  }

  /** @throws {InvalidDeliveryNoteNumberError} préfixe absent, rang non entier ou < 1. */
  static of(orderNumber: string, rank: number): DeliveryNoteNumber {
    const core = orderNumber.startsWith(ORDER_NUMBER_PREFIX)
      ? orderNumber.slice(ORDER_NUMBER_PREFIX.length)
      : "";
    if (core === "" || !Number.isSafeInteger(rank) || rank < 1) {
      throw new InvalidDeliveryNoteNumberError(orderNumber, rank);
    }
    return new DeliveryNoteNumber(`${DELIVERY_NOTE_PREFIX}-${core}-${String(rank)}`);
  }
}
