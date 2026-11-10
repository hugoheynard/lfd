import { Injectable } from "@nestjs/common";

import { DeliveryNoteReprintsReader } from "../../../packing/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { reprintNeededOf } from "../domain/entities/delivery-note.js";

/**
 * Le commerce répond au poste de colisage (plan E6, § 14) : parmi ces
 * commandes, celles dont un BL vivant a été imprimé puis a changé. La règle
 * est celle de l'agrégat (`reprintNeededOf`), relue sur les colonnes.
 */
@Injectable()
export class PrismaDeliveryNoteReprintsReader extends DeliveryNoteReprintsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reprintNeededAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.deliveryNote.findMany({
      where: {
        orderId: { in: [...orderIds] },
        status: { not: "voided" },
        printedVersion: { not: null },
      },
      select: {
        orderId: true,
        contentVersion: true,
        printedVersion: true,
        printedAt: true,
        printedBy: true,
      },
    });
    return new Set(
      rows
        .filter((row) =>
          reprintNeededOf({
            contentVersion: row.contentVersion,
            printed:
              row.printedVersion === null || row.printedAt === null || row.printedBy === null
                ? null
                : { version: row.printedVersion, at: row.printedAt, by: row.printedBy },
          }),
        )
        .map((row) => row.orderId),
    );
  }
}
