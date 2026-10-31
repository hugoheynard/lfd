import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryNoteDiscountPartsReader } from "../domain/ports/delivery-note-discount-parts.reader.js";
import type { NoteDiscountPartView } from "../domain/services/delivery-note-sheet.js";

const frozenLabelSchema = z.object({ fr: z.string().min(1) });

/** Le libellé figé en français ; `null` sans libellé lisible — le papier dit alors « Remise ». */
function frenchLabelOf(value: Prisma.JsonValue | null): string | null {
  const parsed = frozenLabelSchema.safeParse(value);
  return parsed.success ? parsed.data.fr : null;
}

/** `delivery_note_discounts` et le libellé de leur remise, par le client routé. */
@Injectable()
export class PrismaDeliveryNoteDiscountPartsReader extends DeliveryNoteDiscountPartsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async partsOf(
    noteIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly NoteDiscountPartView[]>> {
    if (noteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryNoteDiscount.findMany({
      where: { noteId: { in: [...noteIds] } },
      select: {
        noteId: true,
        amountCents: true,
        amountTtcCents: true,
        orderDiscount: { select: { label: true, rank: true } },
      },
      orderBy: [{ orderDiscount: { rank: "asc" } }, { id: "asc" }],
    });
    const byNote = new Map<string, NoteDiscountPartView[]>();
    for (const row of rows) {
      const parts = byNote.get(row.noteId) ?? [];
      parts.push({
        label: frenchLabelOf(row.orderDiscount.label),
        amountCents: row.amountCents,
        amountTtcCents: row.amountTtcCents,
      });
      byNote.set(row.noteId, parts);
    }
    return byNote;
  }
}
