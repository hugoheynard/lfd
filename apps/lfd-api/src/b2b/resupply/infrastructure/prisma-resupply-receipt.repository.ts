import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplyReceiptChangedMeanwhileError } from "../domain/resupply-receipt-errors.js";
import { ResupplyReceiptRepository } from "../domain/resupply-receipt.repository.js";

/** Une journée civile en colonne `DATE` : minuit UTC, que Postgres tronque au jour. */
function dayColumn(serviceDay: string): Date {
  return new Date(`${serviceDay}T00:00:00.000Z`);
}

const LINES = {
  orderBy: { position: "asc" },
  select: { sku: true, label: true, quantity: true },
} as const;

/**
 * Adaptateur Prisma de la réception (`resupply_receipt` + ses lignes). `save`
 * réécrit les lignes sous le verrou de la version lue : une liste modifiée
 * entre-temps par un autre poste n'est pas écrasée. Les lignes sont des
 * parties de l'agrégat, pas des agrégats : en retirer une la supprime.
 */
@Injectable()
export class PrismaResupplyReceiptRepository extends ResupplyReceiptRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(siteId: string, serviceDay: string): Promise<ResupplyReceipt | null> {
    const row = await this.prisma.resupplyReceipt.findUnique({
      where: { siteId_serviceDay: { siteId, serviceDay: dayColumn(serviceDay) } },
      include: { lines: LINES },
    });
    if (row === null) {
      return null;
    }
    return ResupplyReceipt.restore({
      id: row.id,
      siteId: row.siteId,
      serviceDay,
      version: row.version,
      lines: row.lines,
      lastChange: {
        at: row.updatedAt,
        author: {
          staffUserId: row.updatedByStaffId,
          name: row.updatedByName,
          role: row.updatedByRole,
        },
      },
    });
  }

  async save(receipt: ResupplyReceipt): Promise<void> {
    const change = receipt.lastChange;
    if (change === null) {
      return;
    }
    const trace = {
      updatedAt: change.at,
      updatedByStaffId: change.author.staffUserId,
      updatedByName: change.author.name,
      updatedByRole: change.author.role,
    };
    await this.prisma.$transaction(async (tx) => {
      if (receipt.version === 0) {
        await tx.resupplyReceipt.upsert({
          where: { id: receipt.id },
          create: {
            id: receipt.id,
            siteId: receipt.siteId,
            serviceDay: dayColumn(receipt.serviceDay),
            version: 1,
            ...trace,
          },
          update: {},
        });
      } else {
        const { count } = await tx.resupplyReceipt.updateMany({
          where: { id: receipt.id, version: receipt.version },
          data: { version: receipt.version + 1, ...trace },
        });
        if (count === 0) {
          throw new ResupplyReceiptChangedMeanwhileError();
        }
      }
      await tx.resupplyReceiptLine.deleteMany({ where: { receiptId: receipt.id } });
      await tx.resupplyReceiptLine.createMany({
        data: receipt.lines.map((line, position) => ({
          receiptId: receipt.id,
          sku: line.sku,
          label: line.label,
          quantity: line.quantity,
          position,
        })),
      });
    });
  }
}
