import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterAccountOutstandingReader } from "../domain/ports/counter-account-outstanding.reader.js";

/**
 * Une commande au compte qui reste due : réglée hors ligne (`not_required`),
 * ni annulée, ni réglée en boutique.
 */
const ON_ACCOUNT_ORDER = {
  paymentStatus: "not_required",
  status: { not: "cancelled" },
  settlementVenue: null,
} as const satisfies Prisma.OrderWhereInput;

/**
 * Adaptateur Prisma de l'encours par lot : UNE requête, le mur dans le
 * `where` (`company_id IN (…)`). Le montant d'une commande est son total
 * facturable une fois livrée (`billable_total_cents`, reliquat déduit), son
 * total passé sinon.
 */
@Injectable()
export class PrismaCounterAccountOutstandingReader extends CounterAccountOutstandingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async outstandingOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const owed = new Map<string, number>();
    if (companyIds.length === 0) {
      return owed;
    }
    const rows = await this.prisma.order.findMany({
      where: { companyId: { in: [...companyIds] }, ...ON_ACCOUNT_ORDER },
      select: { companyId: true, totalCents: true, billableTotalCents: true },
    });
    for (const row of rows) {
      if (row.companyId !== null) {
        const amount = row.billableTotalCents ?? row.totalCents;
        owed.set(row.companyId, (owed.get(row.companyId) ?? 0) + amount);
      }
    }
    return owed;
  }
}
