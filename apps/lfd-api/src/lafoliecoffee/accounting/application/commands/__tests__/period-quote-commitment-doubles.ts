import { OpenableUnitOfWork } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { SealingIntentLedger } from "../../../../../platform/intent/__tests__/sealing-intent-ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  QuotedOrdersCommitment,
  type QuotedCommitmentReceipt,
} from "../../../domain/ports/quoted-orders-commitment.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
import { CREDITOR } from "../../../domain/services/__tests__/collection-fixtures.js";
import type { InvoiceableOrder } from "../../../domain/services/monthly-invoicing.js";
import type { CollectionMeans } from "../../../domain/value-objects/collection-means.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { PeriodQuoteInvoicePlanner } from "../../services/period-quote-invoice-planner.js";
import { PeriodQuoteInvoicing } from "../../services/period-quote-invoicing.js";
import {
  ENTITY,
  MemoryQuoteOrders,
  NOW,
  NotedRowsLock,
  PAYER,
  armyOrder,
  shelvedQuote,
} from "../../services/__tests__/period-quote-document-doubles.js";
import { ReceivePeriodQuoteCommitmentHandler } from "../receive-period-quote-commitment.handler.js";
import { meansRow, PayerMeansStore, StorePayersMeansReader } from "./collection-means-doubles.js";
import { FakeMandates, FixedBuyers, FixedCreditors, UlidSequence } from "./collection-doubles.js";
import {
  CountingNumbering,
  FakeMonthlyReader,
  FixedCommitmentRequirements,
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
  MemoryInvoices,
  MemoryOutcomes,
} from "./monthly-invoice-doubles.js";
import { RecordingDurable } from "./notice-doubles.js";
import { MemoryPeriodQuotes } from "./period-quote-doubles.js";

/**
 * Le monde de « Engagement reçu » (QD6) : les ports doublés à la main, les
 * services réels — l'émission, le planificateur, l'`Issuance` partagée. Un
 * devis v1 rangé sur deux commandes de l'armée, sans numéro. Les dates sont
 * des données (celles du monde du devis), jamais comparées au mur.
 */

/** Le code service du devis. */
export const SERVICE_CODE = "SERV-RH";

/** L'armée est un service de l'État. */
class PublicBuyers extends StatementBuyerReader {
  async buyersOf(ids: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    const all = await new FixedBuyers().buyersOf(ids);
    return new Map(
      [...all.entries()].map(([id, buyer]) => [id, { ...buyer, legalForm: "public_state" }]),
    );
  }
}

/**
 * La commande, doublée : elle écrit le numéro reçu sur les commandes en
 * mémoire, avec le code service du devis — ou celui de `codes`, pour
 * simuler une commande dont le code a changé depuis le rangement.
 */
export class OrdersTakingTheNumber extends QuotedOrdersCommitment {
  readonly receipts: QuotedCommitmentReceipt[] = [];
  readonly codes = new Map<string, string>();
  refusal: Error | null = null;

  constructor(private readonly orders: Map<string, InvoiceableOrder>) {
    super();
  }

  acceptQuoted(receipt: QuotedCommitmentReceipt): Promise<void> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.receipts.push(receipt);
    for (const orderId of receipt.orderIds) {
      const order = this.orders.get(orderId);
      if (order !== undefined) {
        const serviceCode = this.codes.get(orderId) ?? SERVICE_CODE;
        const budgetCommitment = { number: receipt.number.trim(), serviceCode };
        this.orders.set(orderId, { ...order, budgetCommitment });
      }
    }
    return Promise.resolve();
  }
}

/**
 * Un devis v1 rangé sur deux commandes, et le geste prêt à être joué.
 * `means` : le moyen du payeur et le jour où il prend effet.
 */
export function commitmentWorld(
  options: { readonly means?: CollectionMeans; readonly meansFrom?: Date } = {},
) {
  const orders = new Map([
    ["a", armyOrder("a")],
    ["b", armyOrder("b")],
  ]);
  const placed = [...orders.values()].map((order) => ({
    ...order,
    budgetCommitment: { number: "", serviceCode: SERVICE_CODE },
  }));
  placed.forEach((order) => orders.set(order.orderId, order));
  const quotes = new MemoryPeriodQuotes();
  const quote = shelvedQuote(placed);
  void quotes.insertAwaiting(quote);
  const invoices = new MemoryInvoices();
  const outcomes = new MemoryOutcomes();
  const reader = new FakeMonthlyReader(invoices, outcomes);
  const means = new PayerMeansStore();
  means.rows.push(
    meansRow(
      PAYER,
      options.means ?? "bank_transfer",
      options.meansFrom ?? new Date("2026-08-01T00:00:00.000Z"),
      ENTITY,
    ),
  );
  const uow = new OpenableUnitOfWork();
  const clock = new FixedClock(NOW);
  const events = new RecordingPublisher();
  const durable = new RecordingDurable();
  const rows = new NotedRowsLock(uow);
  const taking = new OrdersTakingTheNumber(orders);
  const requirements = new FixedCommitmentRequirements();
  requirements.requirements.set(PAYER, {
    commitmentRequired: true,
    serviceCodeRequired: true,
    timing: "on_period_quote",
  });
  const planner = new PeriodQuoteInvoicePlanner(
    reader,
    new PublicBuyers(),
    new FakeMandates(),
    new StorePayersMeansReader(means),
    requirements,
    new FixedCreditors(CREDITOR),
    new FixedIssuers([SELLER_FACTS]),
    new FixedModeDates(),
    new FixedPayerModes(),
  );
  const issuer = new InvoiceIssuer(new CountingNumbering(), invoices, clock, events, uow, durable);
  const invoicing = new PeriodQuoteInvoicing(
    quotes,
    rows,
    new MemoryQuoteOrders(orders),
    taking,
    planner,
    issuer,
    outcomes,
    new UlidSequence(),
    clock,
    uow,
  );
  const ledger = new SealingIntentLedger(() => uow.open);
  const handler = new ReceivePeriodQuoteCommitmentHandler(
    invoicing,
    events,
    clock,
    uow,
    inMemoryIntents(ledger),
  );
  return {
    quote: quote.toSnapshot(),
    quotes,
    orders,
    invoices,
    outcomes,
    events,
    durable,
    rows,
    taking,
    ledger,
    handler,
  };
}
