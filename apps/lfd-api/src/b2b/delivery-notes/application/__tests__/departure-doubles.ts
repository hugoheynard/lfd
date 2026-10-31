import { OrderBasketDiscountsReader } from "../../../orders/domain/ports/order-basket-discounts.reader.js";
import type { FrozenBasketDiscount } from "../../../orders/domain/services/frozen-basket-discounts.js";
import { DeliveryNoteDiscountWriter } from "../../domain/ports/delivery-note-discount.writer.js";
import type { DeliveryNoteDiscountPart } from "../../domain/services/delivery-note-discount-parts.js";
import { DeliveryNoteDepartureRecorder } from "../services/delivery-note-departure-recorder.js";

/** Les remises figées d'une commande, par identifiant ; vide si on n'en dit rien. */
export class FixedBasketDiscounts extends OrderBasketDiscountsReader {
  constructor(
    private readonly byOrder: ReadonlyMap<string, readonly FrozenBasketDiscount[]> = new Map(),
  ) {
    super();
  }

  discountsOf(orderId: string): Promise<readonly FrozenBasketDiscount[]> {
    return Promise.resolve(this.byOrder.get(orderId) ?? []);
  }
}

/** Les parts écrites, par bon — l'unicité `(note_id, order_discount_id)` de la base comprise. */
export class RecordingNoteDiscounts extends DeliveryNoteDiscountWriter {
  readonly byNote = new Map<string, DeliveryNoteDiscountPart[]>();

  record(noteId: string, parts: readonly DeliveryNoteDiscountPart[]): Promise<void> {
    const kept = this.byNote.get(noteId) ?? [];
    for (const part of parts) {
      if (!kept.some((one) => one.orderDiscountId === part.orderDiscountId)) {
        kept.push(part);
      }
    }
    if (kept.length > 0) {
      this.byNote.set(noteId, kept);
    }
    return Promise.resolve();
  }
}

/** Un enregistreur de départ sur ces doubles. */
export function departureRecorderOf(
  discounts: OrderBasketDiscountsReader = new FixedBasketDiscounts(),
  writer: DeliveryNoteDiscountWriter = new RecordingNoteDiscounts(),
): DeliveryNoteDepartureRecorder {
  return new DeliveryNoteDepartureRecorder(discounts, writer);
}
