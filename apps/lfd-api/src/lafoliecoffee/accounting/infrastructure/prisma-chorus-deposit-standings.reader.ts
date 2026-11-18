import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ChorusDepositStandingsReader } from "../domain/ports/chorus-deposit-standings.reader.js";
import type { ChorusDepositStanding } from "../domain/services/public-invoice-due.js";
import { chorusStandingOfRows } from "./chorus-deposit-rows.js";

/** Le journal de dépôt de plusieurs pièces, en UNE requête. */
@Injectable()
export class PrismaChorusDepositStandingsReader extends ChorusDepositStandingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingsOf(
    invoiceIds: readonly string[],
  ): Promise<ReadonlyMap<string, ChorusDepositStanding>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.invoiceChorusDeposit.findMany({
      where: { invoiceId: { in: [...invoiceIds] } },
      select: { invoiceId: true, kind: true, occurredOn: true, reason: true },
    });
    const byInvoice = new Map<string, (typeof rows)[number][]>();
    for (const row of rows) {
      byInvoice.set(row.invoiceId, [...(byInvoice.get(row.invoiceId) ?? []), row]);
    }
    return new Map(
      [...byInvoice].map(([invoiceId, entries]) => [
        invoiceId,
        chorusStandingOfRows(invoiceId, entries),
      ]),
    );
  }
}
