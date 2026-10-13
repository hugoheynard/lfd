import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OpenOrderCutoffWaiverReader,
  type OpenCutoffWaiverEntry,
} from "../domain/open-order-cutoff-waiver.reader.js";

@Injectable()
export class PrismaOpenOrderCutoffWaiverReader extends OpenOrderCutoffWaiverReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listFrom(firstDay: string): Promise<readonly OpenCutoffWaiverEntry[]> {
    const rows = await this.prisma.orderCutoffWaiver.findMany({
      // `fulfillment_date` est une DATE, que Prisma lit et écrit à minuit UTC
      // (comme l'accord, dans le dépôt voisin) : un jour comparé à un jour,
      // pas une fenêtre de validité.
      where: { fulfillmentDate: { gte: new Date(`${firstDay}T00:00:00.000Z`) } },
      include: { company: { select: { enseigne: true, raisonSociale: true } } },
      orderBy: [{ fulfillmentDate: "asc" }, { grantedAt: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      companyName: row.company.enseigne === "" ? row.company.raisonSociale : row.company.enseigne,
      fulfillmentDate: row.fulfillmentDate.toISOString().slice(0, 10),
      reason: row.reason,
      grantedByStaffId: row.grantedByStaffId,
      grantedAt: row.grantedAt,
      usedByOrderId: row.usedByOrderId,
    }));
  }
}
