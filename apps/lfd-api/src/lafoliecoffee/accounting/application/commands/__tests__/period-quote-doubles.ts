import { PeriodQuote, type PeriodQuoteSnapshot } from "../../../domain/entities/period-quote.js";
import {
  PeriodQuoteCommitmentClosedError,
  PeriodQuoteNotAwaitingError,
  PeriodQuoteResendConflictError,
} from "../../../domain/errors/period-quote-errors.js";
import { PeriodQuoteRepository } from "../../../domain/ports/period-quote.repository.js";

/**
 * Les devis de période en mémoire, avec les deux unicités que la base tient
 * par ses index partiels : un devis vivant par groupe et par clôture, une
 * commande dans un seul devis en attente. `awaitingOrders` est l'ensemble que
 * le lecteur de la clôture écarte (`FakeMonthlyReader.quotedOrders`) : un
 * rejeu voit ce que le premier passage a rangé, comme la base.
 */
export class MemoryPeriodQuotes extends PeriodQuoteRepository {
  readonly quotes = new Map<string, PeriodQuoteSnapshot>();
  readonly ranks = new Map<string, number>();
  /** Les commandes que la base aurait déjà prises : `insertAwaiting` les laisse dehors. */
  readonly takenElsewhere = new Set<string>();

  constructor(readonly awaitingOrders: Set<string> = new Set<string>()) {
    super();
  }

  nextRank(legalEntityId: string, periodTag: string): Promise<number> {
    const key = `${legalEntityId}|${periodTag}`;
    const rank = (this.ranks.get(key) ?? 0) + 1;
    this.ranks.set(key, rank);
    return Promise.resolve(rank);
  }

  insertAwaiting(quote: PeriodQuote): Promise<ReadonlySet<string> | null> {
    const state = quote.toSnapshot();
    const live = [...this.quotes.values()].some(
      (known) => known.state !== "superseded" && groupOf(known) === groupOf(state),
    );
    if (live) {
      return Promise.resolve(null);
    }
    const kept = state.orderIds.filter(
      (orderId) => !this.awaitingOrders.has(orderId) && !this.takenElsewhere.has(orderId),
    );
    kept.forEach((orderId) => this.awaitingOrders.add(orderId));
    this.quotes.set(state.id, { ...state, orderIds: kept });
    return Promise.resolve(new Set(kept));
  }

  save(quote: PeriodQuote): Promise<void> {
    const state = quote.toSnapshot();
    this.quotes.set(state.id, state);
    return Promise.resolve();
  }

  /** Conditionnée sur `awaiting`, comme la base ; ses commandes sortent de l'ensemble en attente. */
  recordInvoiced(quote: PeriodQuote): Promise<void> {
    const state = quote.toSnapshot();
    if (this.quotes.get(state.id)?.state !== "awaiting") {
      return Promise.reject(
        new PeriodQuoteCommitmentClosedError(state.number, state.version, "invoiced"),
      );
    }
    this.quotes.set(state.id, state);
    state.orderIds.forEach((orderId) => this.awaitingOrders.delete(orderId));
    return Promise.resolve();
  }

  load(quoteId: string): Promise<PeriodQuote | null> {
    const state = this.quotes.get(quoteId);
    return Promise.resolve(state === undefined ? null : PeriodQuote.restore(state));
  }

  /** L'ordre de la base : l'ancienne remplacée d'abord, puis la nouvelle, sans `ON CONFLICT`. */
  replace(superseded: PeriodQuote, successor: PeriodQuote): Promise<void> {
    const old = superseded.toSnapshot();
    if (this.quotes.get(old.id)?.state !== "awaiting") {
      return Promise.reject(new PeriodQuoteNotAwaitingError(old.number, old.version, "superseded"));
    }
    this.quotes.set(old.id, { ...old, state: "superseded" });
    old.orderIds.forEach((orderId) => this.awaitingOrders.delete(orderId));
    const next = successor.toSnapshot();
    if (next.orderIds.some((orderId) => this.awaitingOrders.has(orderId))) {
      return Promise.reject(new PeriodQuoteResendConflictError(next.number));
    }
    next.orderIds.forEach((orderId) => this.awaitingOrders.add(orderId));
    this.quotes.set(next.id, next);
    return Promise.resolve();
  }

  all(): readonly PeriodQuoteSnapshot[] {
    return [...this.quotes.values()];
  }
}

function groupOf(state: PeriodQuoteSnapshot): string {
  return [
    state.legalEntityId,
    state.payerCompanyId,
    state.mandateId ?? "",
    state.serviceCode,
    state.periodClosesAt.toISOString(),
  ].join("|");
}
