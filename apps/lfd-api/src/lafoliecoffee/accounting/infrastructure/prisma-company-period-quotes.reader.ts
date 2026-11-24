import type { CompanyPeriodQuoteState, CompanyPeriodQuoteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyPeriodQuotesReader } from "../domain/ports/company-period-quotes.reader.js";
import { UnknownPeriodQuoteStateError } from "../domain/errors/period-quote-errors.js";

/** Les états qu'une version vivante porte — ceux que la fiche liste. */
const LIVE_STATES: readonly CompanyPeriodQuoteState[] = ["awaiting", "invoiced"];
/** La valeur de `period_quote.state` d'une version remplacée. */
const SUPERSEDED = "superseded";

/**
 * Les devis d'un payeur (`period_quote`) : deux lectures, les versions
 * vivantes puis les versions remplacées de leurs numéros, pour l'écart.
 * Surface staff : la fiche client lit le payeur qu'on lui donne.
 */
@Injectable()
export class PrismaCompanyPeriodQuotesReader extends CompanyPeriodQuotesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveOf(payerCompanyId: string): Promise<readonly CompanyPeriodQuoteView[]> {
    const rows = await this.prisma.periodQuote.findMany({
      where: { payerCompanyId, state: { in: [...LIVE_STATES] } },
      orderBy: [{ periodClosesAt: "desc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        version: true,
        state: true,
        periodStartsAt: true,
        periodClosesAt: true,
        serviceCode: true,
        totalTtcCents: true,
        createdAt: true,
        invoice: { select: { id: true, number: true } },
        _count: { select: { orders: true } },
      },
    });
    const previous = await this.previousTotals(rows.filter((row) => row.version > 1));
    return rows.map((row) => {
      const replacedTotal = previous.get(versionKey(row.number, row.version - 1));
      return {
        quoteId: row.id,
        number: row.number,
        version: row.version,
        state: liveStateOf(row.id, row.state),
        periodStartsAt: row.periodStartsAt.toISOString(),
        periodClosesAt: row.periodClosesAt.toISOString(),
        serviceCode: row.serviceCode === "" ? null : row.serviceCode,
        totalCents: row.totalTtcCents,
        orderCount: row._count.orders,
        createdAt: row.createdAt.toISOString(),
        replaced:
          replacedTotal === undefined
            ? null
            : { totalCents: replacedTotal, gapCents: row.totalTtcCents - replacedTotal },
        invoice:
          row.invoice === null ? null : { invoiceId: row.invoice.id, number: row.invoice.number },
      };
    });
  }

  /** Le total de chaque version remplacée qui précède une version listée. */
  private async previousTotals(
    renewed: readonly { readonly number: string; readonly version: number }[],
  ): Promise<ReadonlyMap<string, number>> {
    if (renewed.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.periodQuote.findMany({
      where: {
        state: SUPERSEDED,
        OR: renewed.map((row) => ({ number: row.number, version: row.version - 1 })),
      },
      select: { number: true, version: true, totalTtcCents: true },
    });
    return new Map(rows.map((row) => [versionKey(row.number, row.version), row.totalTtcCents]));
  }
}

function versionKey(number: string, version: number): string {
  return `${number}|${String(version)}`;
}

/** @throws {UnknownPeriodQuoteStateError} un état que la requête n'a pas demandé. */
function liveStateOf(quoteId: string, raw: string): CompanyPeriodQuoteState {
  const state = LIVE_STATES.find((known) => known === raw);
  if (state === undefined) {
    throw new UnknownPeriodQuoteStateError(quoteId, raw);
  }
  return state;
}
