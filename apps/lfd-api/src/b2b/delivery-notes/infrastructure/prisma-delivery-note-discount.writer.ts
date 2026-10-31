import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import type { DiscountVatShare } from "../../orders/domain/services/order-discount-recovery-shapes.js";
import { DeliveryNoteDiscountWriter } from "../domain/ports/delivery-note-discount.writer.js";
import type { DeliveryNoteDiscountPart } from "../domain/services/delivery-note-discount-parts.js";

/**
 * `delivery_note_discounts`, par le client routé. `ON CONFLICT DO NOTHING` :
 * un bon dont la part est déjà écrite (reprise, ou second passage du même
 * départ) la garde telle quelle, sans faire avorter la transaction.
 */
@Injectable()
export class PrismaDeliveryNoteDiscountWriter extends DeliveryNoteDiscountWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async record(noteId: string, parts: readonly DeliveryNoteDiscountPart[]): Promise<void> {
    if (parts.length === 0) {
      return;
    }
    await this.prisma.deliveryNoteDiscount.createMany({
      data: parts.map((part) => ({
        id: this.ids.next(),
        noteId,
        orderDiscountId: part.orderDiscountId,
        amountCents: part.amountCents,
        amountTtcCents: part.amountTtcCents,
        vatShares: sharesJson(part.vatShares),
      })),
      skipDuplicates: true,
    });
  }
}

/** `[{rate, htCents, vatCents?, ttcCents?}]` — la forme que le déclencheur de la commande relit aussi. */
function sharesJson(shares: readonly DiscountVatShare[]): Prisma.InputJsonValue {
  return shares.map((share) => ({
    rate: share.rate,
    htCents: share.htCents,
    ...(share.vatCents === undefined ? {} : { vatCents: share.vatCents }),
    ...(share.ttcCents === undefined ? {} : { ttcCents: share.ttcCents }),
  }));
}
