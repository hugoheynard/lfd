import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PeriodQuote } from "../domain/entities/period-quote.js";
import {
  PeriodQuoteNotAwaitingError,
  PeriodQuoteResendConflictError,
} from "../domain/errors/period-quote-errors.js";
import { PeriodQuoteRepository } from "../domain/ports/period-quote.repository.js";
import { PERIOD_QUOTE_SELECT, periodQuoteSnapshotOf } from "./period-quote-row.js";
import { mandateColumnOf } from "./prisma-monthly-invoice-outcomes.js";

/** L'état d'un devis en attente (`period_quote.state`, CHECK). */
export const AWAITING_QUOTE_STATE = "awaiting";
/** L'état d'un devis remplacé par une version plus récente. */
const SUPERSEDED_QUOTE_STATE = "superseded";

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
      data: [rowOf(quote)],
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

  async load(quoteId: string): Promise<PeriodQuote | null> {
    const row = await this.prisma.periodQuote.findUnique({
      where: { id: quoteId },
      select: PERIOD_QUOTE_SELECT,
    });
    return row === null ? null : PeriodQuote.restore(periodQuoteSnapshotOf(row));
  }

  async replace(superseded: PeriodQuote, successor: PeriodQuote): Promise<void> {
    const old = superseded.toSnapshot();
    // L'ancienne d'abord : tant qu'elle est vivante, l'index du groupe et
    // celui des commandes en attente refuseraient la nouvelle.
    const { count } = await this.prisma.periodQuote.updateMany({
      where: { id: old.id, state: AWAITING_QUOTE_STATE },
      data: { state: SUPERSEDED_QUOTE_STATE },
    });
    if (count === 0) {
      throw new PeriodQuoteNotAwaitingError(old.number, old.version, "superseded");
    }
    const next = successor.toSnapshot();
    try {
      await this.prisma.periodQuote.create({ data: rowOf(successor) });
      await this.prisma.periodQuoteOrder.createMany({
        data: next.orderIds.map((orderId) => ({
          quoteId: next.id,
          orderId,
          quoteState: next.state,
        })),
      });
    } catch (cause: unknown) {
      if (isUniqueViolation(cause)) {
        throw new PeriodQuoteResendConflictError(next.number);
      }
      throw cause;
    }
  }
}

/** La ligne `period_quote` d'un devis. */
function rowOf(quote: PeriodQuote): {
  readonly id: string;
  readonly number: string;
  readonly version: number;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly mandateId: string;
  readonly serviceCode: string;
  readonly periodStartsAt: Date;
  readonly periodClosesAt: Date;
  readonly state: string;
  readonly fingerprint: string;
  readonly totalTtcCents: number;
  readonly createdAt: Date;
} {
  const state = quote.toSnapshot();
  return {
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
  };
}
