import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecapDeliveryNotesReader } from "../domain/ports/recap-delivery-notes.reader.js";
import type { RecapSourceNote } from "../domain/services/recap-aggregation.js";
import type { RecapWindow } from "../domain/value-objects/recap-month.js";

/** La nature d'offre d'une commande interne (`orders_offer_nature_known`). */
const IN_HOUSE_OFFER = "in_house";

/**
 * Les BL qu'un récapitulatif couvre : le BL COURANT (`delivery_note`, jamais
 * `delivery_note_version`), remis (`handed_over`) dans `[from, to[`, d'une
 * commande interne. Le payeur est `billed_company_id`, ou `company_id` à
 * défaut — le payeur résolu à la passation.
 */
@Injectable()
export class PrismaRecapDeliveryNotesReader extends RecapDeliveryNotesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async payersWithUncoveredNotes(window: RecapWindow): Promise<readonly string[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: {
        ...handedOverIn(window),
        ...uncovered(null),
        order: { offerNature: IN_HOUSE_OFFER },
      },
      select: { order: { select: { companyId: true, billedCompanyId: true } } },
    });
    const payers = new Set<string>();
    for (const { order } of rows) {
      const payer = order.billedCompanyId ?? order.companyId;
      if (payer !== null) {
        payers.add(payer);
      }
    }
    return [...payers];
  }

  async uncoveredNotesOf(
    payerId: string,
    window: RecapWindow,
    releasing: string | null,
  ): Promise<readonly RecapSourceNote[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: {
        ...handedOverIn(window),
        ...uncovered(releasing),
        order: {
          offerNature: IN_HOUSE_OFFER,
          OR: [{ billedCompanyId: payerId }, { billedCompanyId: null, companyId: payerId }],
        },
      },
      select: {
        id: true,
        number: true,
        handedOverAt: true,
        contentVersion: true,
        lines: { select: { sku: true, productName: true, saleUnit: true, quantity: true } },
      },
      orderBy: [{ handedOverAt: "asc" }, { number: "asc" }],
    });
    return rows.flatMap((row) =>
      row.handedOverAt === null
        ? []
        : [
            {
              deliveryNoteId: row.id,
              number: row.number,
              handedOverAt: row.handedOverAt,
              contentVersion: row.contentVersion,
              lines: row.lines,
            },
          ],
    );
  }
}

function handedOverIn({ from, to }: RecapWindow) {
  return { status: "handed_over" as const, handedOverAt: { gte: from, lt: to } };
}

/** Aucun récapitulatif non remplacé ne le couvre — hors celui qu'on libère. */
function uncovered(releasing: string | null) {
  return {
    inHouseRecapNotes: {
      none:
        releasing === null
          ? { replacedAt: null }
          : { replacedAt: null, recapId: { not: releasing } },
    },
  };
}
