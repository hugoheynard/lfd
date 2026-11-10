import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  FailedSettlementReader,
  type FailedSettlementSubject,
} from "../domain/ports/failed-settlement.reader.js";

/** Adaptateur Prisma : la commande, sa clientèle figée, et le nom de sa société. */
@Injectable()
export class PrismaFailedSettlementReader extends FailedSettlementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async subjectOf(orderId: string): Promise<FailedSettlementSubject | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        clientele: true,
        company: { select: { raisonSociale: true, enseigne: true } },
      },
    });
    if (row === null) {
      return null;
    }
    const company = row.company;
    return {
      orderNumber: row.orderNumber,
      clientele: row.clientele,
      // La règle de `Company.displayName()` : l'enseigne, à défaut la raison sociale.
      companyName:
        company === null
          ? null
          : company.enseigne === ""
            ? company.raisonSociale
            : company.enseigne,
    };
  }
}
