import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PeriodQuote } from "../domain/entities/period-quote.js";
import { PeriodQuoteRepository } from "../domain/ports/period-quote.repository.js";
import { mandateColumnOf } from "./prisma-monthly-invoice-outcomes.js";

/** L'état d'un devis en attente (`period_quote.state`, CHECK). */
export const AWAITING_QUOTE_STATE = "awaiting";

/**
 * Les devis de période dans `public.period_quote`, `period_quote_order` et
 * `period_quote_counter` (migration `20261124220000_le_devis_de_periode`).
 *
 * Le client est le client ROUTÉ : appelé dans la transaction de la clôture
 * d'un payeur, rang, devis et commandes partent ensemble ou pas du tout.
 *
 * `createMany` + `skipDuplicates` est un `INSERT … ON CONFLICT DO NOTHING`
 * sans cible : il couvre les index uniques PARTIELS que la migration pose —
 * un seul devis vivant par groupe et par clôture, une commande dans un seul
 * devis en attente. Rien n'est vérifié en mémoire avant : la base tranche.
 */
@Injectable()
export class PrismaPeriodQuoteRepository extends PeriodQuoteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nextRank(legalEntityId: string, periodTag: string): Promise<number> {
    // `upsert` sur la clé primaire : un `INSERT … ON CONFLICT DO UPDATE`, qui
    // verrouille la ligne jusqu'à la fin de la transaction.
    const row = await this.prisma.periodQuoteCounter.upsert({
      where: { legalEntityId_periodTag: { legalEntityId, periodTag } },
      create: { legalEntityId, periodTag, lastRank: 1 },
      update: { lastRank: { increment: 1 } },
      select: { lastRank: true },
    });
    return row.lastRank;
  }

  async insertAwaiting(quote: PeriodQuote): Promise<ReadonlySet<string> | null> {
    const state = quote.toSnapshot();
    const { count } = await this.prisma.periodQuote.createMany({
      data: [
        {
          id: state.id,
          number: state.number,
          version: state.version,
          legalEntityId: state.legalEntityId,
          payerCompanyId: state.payerCompanyId,
          payerName: state.payerName,
          mandateId: mandateColumnOf(state.mandateId),
          serviceCode: state.serviceCode,
          periodStartsAt: state.periodStartsAt,
          periodClosesAt: state.periodClosesAt,
          state: state.state,
          fingerprint: state.fingerprint,
          totalTtcCents: state.totalTtcCents,
          createdAt: state.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) {
      return null;
    }
    await this.prisma.periodQuoteOrder.createMany({
      data: state.orderIds.map((orderId) => ({
        quoteId: state.id,
        orderId,
        quoteState: state.state,
      })),
      skipDuplicates: true,
    });
    const kept = await this.prisma.periodQuoteOrder.findMany({
      where: { quoteId: state.id },
      select: { orderId: true },
    });
    return new Set(kept.map((row) => row.orderId));
  }

  async save(quote: PeriodQuote): Promise<void> {
    const state = quote.toSnapshot();
    await this.prisma.periodQuote.update({
      where: { id: state.id },
      data: { fingerprint: state.fingerprint, totalTtcCents: state.totalTtcCents },
    });
  }
}
