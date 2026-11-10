import { Injectable, Logger } from "@nestjs/common";

import { OrderBasketDiscountsReader } from "../../../orders/domain/ports/order-basket-discounts.reader.js";
import type { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteDiscountWriter } from "../../domain/ports/delivery-note-discount.writer.js";
import { deliveryNoteDiscountPartsOf } from "../../domain/services/delivery-note-discount-parts.js";

/**
 * **Au départ d'un bon, ses parts par remise** (plan des promotions, § 18.2,
 * lot M4) : quand un bon passe `handed_over`, chaque remise de sa commande
 * y reçoit sa part (`delivery_note_discounts`), rejouée sur ses lignes par
 * le domaine.
 *
 * Appelé par les deux écrivains qui remettent un bon — l'alignement du BL-1
 * et la remise d'un reliquat —, dans leur unité de travail, après
 * l'écriture du bon. Un bon pas encore parti n'en a pas : ses lignes peuvent
 * encore changer.
 *
 * Rien n'est inventé : un bon dont les remises rejouées ne redonnent pas
 * l'en-tête, ou dont la commande n'est pas reprise, n'a pas de part — c'est
 * écrit au journal, et la remise du bon reste lisible dans ses colonnes.
 */
@Injectable()
export class DeliveryNoteDepartureRecorder {
  private readonly logger = new Logger(DeliveryNoteDepartureRecorder.name);

  constructor(
    private readonly discounts: OrderBasketDiscountsReader,
    private readonly writer: DeliveryNoteDiscountWriter,
  ) {}

  async recordIfDeparted(note: DeliveryNote): Promise<void> {
    if (note.status !== "handed_over") {
      return;
    }
    const state = note.toState();
    if (state.terms === null || state.terms.discountCents === 0) {
      return;
    }
    const parts = deliveryNoteDiscountPartsOf(
      state,
      await this.discounts.discountsOf(state.orderId),
    );
    if (parts.kind === "unrecorded") {
      this.logger.warn(
        `Bon de livraison ${state.number} (commande ${state.orderId}) remis sans part de remise : ` +
          `${parts.reason}. Sa remise reste lisible dans ses colonnes ; rien n'a été inventé.`,
      );
      return;
    }
    await this.writer.record(state.id, parts.parts);
  }
}
