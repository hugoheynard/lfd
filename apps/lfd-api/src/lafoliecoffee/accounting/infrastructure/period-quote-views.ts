import type { MonthlyPeriodQuoteView } from "@lfd/contracts";

import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { AWAITING_QUOTE_STATE } from "./prisma-period-quote.repository.js";

/**
 * Les devis de période EN ATTENTE d'une clôture, pour la vue de la période
 * (plan `plan-clients-publics-chorus.md`, § 6 sexies, QD3) : sans eux, un
 * payeur dont la clôture n'a rangé qu'un devis n'aurait ni facture ni
 * signalement, et disparaîtrait de l'écran. Surface staff : la comptabilité
 * lit toutes les sociétés de l'entité.
 */
export async function awaitingPeriodQuotesOf(
  prisma: PrismaService,
  legalEntityId: string,
  periodClosesAt: Date,
): Promise<readonly MonthlyPeriodQuoteView[]> {
  const rows = await prisma.periodQuote.findMany({
    where: { legalEntityId, periodClosesAt, state: AWAITING_QUOTE_STATE },
    orderBy: [{ payerName: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      version: true,
      payerCompanyId: true,
      payerName: true,
      serviceCode: true,
      totalTtcCents: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  return rows.map((row) => ({
    quoteId: row.id,
    number: row.number,
    version: row.version,
    payerCompanyId: row.payerCompanyId,
    payerName: row.payerName,
    serviceCode: row.serviceCode === "" ? null : row.serviceCode,
    totalCents: row.totalTtcCents,
    orderCount: row._count.orders,
    createdAt: row.createdAt.toISOString(),
  }));
}
