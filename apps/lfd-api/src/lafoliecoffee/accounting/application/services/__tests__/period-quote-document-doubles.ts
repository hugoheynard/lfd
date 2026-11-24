import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PeriodQuote, type PeriodQuoteSnapshot } from "../../../domain/entities/period-quote.js";
import { OrderRowsLock } from "../../../domain/ports/order-rows-lock.js";
import { PeriodQuoteOrdersReader } from "../../../domain/ports/period-quote-orders.reader.js";
import { PeriodQuoteReader } from "../../../domain/ports/period-quote.reader.js";
import { QuoteMercurialeReader } from "../../../domain/ports/quote-mercuriale.reader.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";
import type { InvoiceableOrder } from "../../../domain/services/monthly-invoicing.js";
import { frozenOrder } from "../../../domain/services/__tests__/collection-fixtures.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { InvoiceFontSource } from "../../../domain/ports/invoice-font-source.js";
import type { InvoicePdfFonts } from "../../../domain/ports/invoice-font-source.js";
import { entityRecord, OneEntity } from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { RecordingDurable } from "../../commands/__tests__/notice-doubles.js";
import { MemoryPeriodQuotes } from "../../commands/__tests__/period-quote-doubles.js";
import { PeriodQuoteDocumentRenderer } from "../period-quote-document-renderer.js";
import { PeriodQuoteNoticeSender } from "../period-quote-notice-sender.js";
import { PeriodQuoteReviser } from "../period-quote-reviser.js";
import { FixedPayerContacts, MemoryKeptStore } from "./issued-invoice-doubles.js";

/**
 * Le monde d'un devis de période, pour son document, son envoi et son renvoi
 * (QD4, QD5) : les ports doublés à la main, les services réels. Les dates
 * sont des données, jamais comparées à l'horloge.
 */

/** Le 1er novembre 2026 à 00h00, heure de Paris : la clôture d'octobre. */
export const CLOSES_AT = new Date("2026-10-31T23:00:00.000Z");
const STARTS_AT = new Date("2026-09-30T22:00:00.000Z");
const PLACED_AT = new Date("2026-10-12T08:00:00.000Z");
export const NOW = new Date("2026-11-03T09:00:00.000Z");
export const PAYER = "c_army";
export const ENTITY = "le_1";

/** Une commande facturable de l'armée ; `pieces` change son montant, donc l'empreinte. */
export function armyOrder(id: string, pieces = 1): InvoiceableOrder {
  const frozen = frozenOrder(`ORD-${id}`, PLACED_AT);
  const [line] = frozen.lines;
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: PAYER,
    placedAt: PLACED_AT,
    receivedOn: "2026-10-13",
    billedCompanyId: null,
    frozen:
      line === undefined || pieces === 1
        ? frozen
        : {
            ...frozen,
            lines: [{ ...line, quantity: pieces, lineTotalCents: line.lineTotalCents * pieces }],
            vatShares: [{ rate: 5.5, amountCents: 52 * pieces }],
            vatCents: 52 * pieces,
            totalCents: 1_000 * pieces,
          },
    deliveryNoteNumbers: [],
    budgetCommitment: null,
  };
}

/** Le devis v1 rangé à la clôture sur ces commandes. */
export function shelvedQuote(orders: readonly InvoiceableOrder[]): PeriodQuote {
  return PeriodQuote.shelve({
    id: "q_1",
    rank: 1,
    legalEntityId: ENTITY,
    payerCompanyId: PAYER,
    payerName: "Caserne des Alpes",
    mandateId: null,
    serviceCode: "SERV-RH",
    periodStartsAt: STARTS_AT,
    periodClosesAt: CLOSES_AT,
    orders,
    createdAt: CLOSES_AT,
  });
}

/** Les commandes d'aujourd'hui, par identifiant — on les change pour changer l'empreinte. */
export class MemoryQuoteOrders extends PeriodQuoteOrdersReader {
  constructor(readonly orders: Map<string, InvoiceableOrder>) {
    super();
  }
  liveOrdersOf(orderIds: readonly string[]): Promise<readonly InvoiceableOrder[]> {
    return Promise.resolve(orderIds.flatMap((id) => this.orders.get(id) ?? []));
  }
}

/** Le lecteur des devis, sur le même dépôt en mémoire que l'écriture. */
export class MemoryQuoteReader extends PeriodQuoteReader {
  constructor(private readonly quotes: MemoryPeriodQuotes) {
    super();
  }
  byId(quoteId: string): Promise<PeriodQuoteSnapshot | null> {
    return Promise.resolve(this.quotes.quotes.get(quoteId) ?? null);
  }
}

export class FixedMercuriale extends QuoteMercurialeReader {
  readonly asked: Date[] = [];
  constructor(private readonly label: string | null) {
    super();
  }
  labelAt(_payer: string, at: Date): Promise<string | null> {
    this.asked.push(at);
    return Promise.resolve(this.label);
  }
}

class TestFonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.resolve(TEST_FONTS);
  }
}

/** Le verrou des lignes `orders` : il note ce qu'on lui demande, et si l'unité était ouverte. */
export class NotedRowsLock extends OrderRowsLock {
  readonly locked: { readonly ids: readonly string[]; readonly inside: boolean }[] = [];
  constructor(private readonly uow: OpenableUnitOfWork) {
    super();
  }
  lockAll(orderIds: readonly string[]): Promise<void> {
    this.locked.push({ ids: orderIds, inside: this.uow.open });
    return Promise.resolve();
  }
}

const BILLING: PayerNoticeContacts = {
  billingContacts: [{ id: "contact:1", email: "intendance@caserne.test" }],
  owner: { id: "user:owner", email: "chef@caserne.test" },
};

/** Le monde : un devis v1 rangé sur deux commandes, un contact de facturation. */
export function quoteWorld(options: { readonly contacts?: PayerNoticeContacts | null } = {}) {
  const orders = new Map([
    ["a", armyOrder("a")],
    ["b", armyOrder("b")],
  ]);
  const quotes = new MemoryPeriodQuotes();
  const quote = shelvedQuote([...orders.values()]);
  void quotes.insertAwaiting(quote);
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMail(uow);
  const events = new RecordingPublisher();
  const durable = new RecordingDurable();
  const kept = new MemoryKeptStore();
  const clock = new FixedClock(NOW);
  const rows = new NotedRowsLock(uow);
  const quoteOrders = new MemoryQuoteOrders(orders);
  const contacts = options.contacts === undefined ? BILLING : options.contacts;
  const payers = new FixedPayerContacts(
    contacts === null ? new Map() : new Map([[PAYER, contacts]]),
  );
  const documents = new PeriodQuoteDocumentRenderer(
    quoteOrders,
    new OneEntity({ ...entityRecord(), id: ENTITY }),
    new FixedMercuriale("Tarif convenu de la caserne"),
    new TestFonts(),
    kept,
  );
  const sender = new PeriodQuoteNoticeSender(payers, events, clock, uow, mails);
  const reviser = new PeriodQuoteReviser(
    quotes,
    rows,
    quoteOrders,
    new FixedIdGenerator("q"),
    clock,
    durable,
    uow,
  );
  return {
    quote: quote.toSnapshot(),
    quotes,
    reader: new MemoryQuoteReader(quotes),
    orders,
    uow,
    mails,
    events,
    durable,
    kept,
    clock,
    rows,
    documents,
    sender,
    reviser,
  };
}
