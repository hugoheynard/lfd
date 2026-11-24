import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { PERIOD_QUOTE_ISSUED } from "../../../domain/events/period-quote-issued.fact.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import {
  CREDITOR,
  ENTITY_ID,
  frozenOrder,
  mandate,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import {
  invoiceGroupKey,
  type InvoiceableOrder,
} from "../../../domain/services/monthly-invoicing.js";
import { periodQuoteFigures } from "../../../domain/services/period-quote-fingerprint.js";
import { INVOICE_ISSUED } from "../../../domain/events/invoice-issued.fact.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { PeriodQuoteShelver } from "../../services/period-quote-shelver.js";
import { IssueMonthlyInvoicesCommand } from "../issue-monthly-invoices.command.js";
import { IssueMonthlyInvoicesHandler } from "../issue-monthly-invoices.handler.js";
import { meansRow, PayerMeansStore, StorePayersMeansReader } from "./collection-means-doubles.js";
import {
  FakeCancelled,
  FakeMandates,
  FixedBuyers,
  FixedCreditors,
  RecordingRowsLock,
  UlidSequence,
} from "./collection-doubles.js";
import {
  CountingNumbering,
  CurrentCommitments,
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
 * **Le devis de période à la clôture** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, QD3, v5 B3, B4, S4) — l'orchestration, ports doublés à la main.
 * Les dates sont le SUJET : l'horloge est fixe et posée par rapport à la
 * clôture demandée.
 */

/** Le 1er octobre 2026 à 00h00, heure de Paris : la clôture de septembre. */
const CLOSURE = "2026-09-30T22:00:00.000Z";
const AFTER_MOMENT = new Date("2026-09-30T21:56:00.000Z");
const FLOOR = new Date("2026-08-31T22:00:00.000Z");
const ARMY = "c_army";
const SCHOOL = "c_school";

let seq = 0;
function bon(companyId: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  seq += 1;
  const orderNumber = `ORD-Q${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `q${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: frozenOrder(orderNumber, placedAt),
    deliveryNoteNumbers: [],
    budgetCommitment: null,
    ...overrides,
  };
}

/** Les deux payeurs sont des organismes publics. */
class PublicBuyers extends StatementBuyerReader {
  async buyersOf(ids: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    const all = await new FixedBuyers().buyersOf(ids);
    return new Map(
      [...all.entries()].map(([id, buyer]) => [id, { ...buyer, legalForm: "public_state" }]),
    );
  }
}

function harness() {
  const invoices = new MemoryInvoices();
  const outcomes = new MemoryOutcomes();
  const reader = new FakeMonthlyReader(invoices, outcomes);
  reader.floorAt = FLOOR;
  const mandates = new FakeMandates();
  mandates.mandates = [mandate(ARMY), mandate(SCHOOL)];
  const means = new PayerMeansStore();
  means.rows.push(meansRow(ARMY, "bank_transfer", paris("2026-08-01"), ENTITY_ID));
  means.rows.push(meansRow(SCHOOL, "bank_transfer", paris("2026-08-01"), ENTITY_ID));
  const clock = new FixedClock(AFTER_MOMENT);
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const durable = new RecordingDurable();
  const issuer = new InvoiceIssuer(new CountingNumbering(), invoices, clock, events, uow, durable);
  const commitments = new CurrentCommitments(reader);
  const requirements = new FixedCommitmentRequirements();
  requirements.requirements.set(ARMY, {
    commitmentRequired: true,
    serviceCodeRequired: false,
    timing: "on_period_quote",
  });
  requirements.requirements.set(SCHOOL, {
    commitmentRequired: true,
    serviceCodeRequired: false,
    timing: "at_order",
  });
  const quotes = new MemoryPeriodQuotes(reader.quotedOrders);
  const cancelled = new FakeCancelled();
  const handler = new IssueMonthlyInvoicesHandler(
    reader,
    new FixedModeDates(),
    new FixedPayerModes(),
    new FixedCreditors(CREDITOR),
    new FixedIssuers([SELLER_FACTS]),
    new PublicBuyers(),
    mandates,
    new StorePayersMeansReader(means),
    issuer,
    outcomes,
    new RecordingRowsLock({ log: [] }),
    cancelled,
    commitments,
    requirements,
    new PeriodQuoteShelver(
      quotes,
      new RecordingRowsLock({ log: [] }),
      cancelled,
      commitments,
      new UlidSequence(),
      durable,
      uow,
    ),
    new UlidSequence(),
    events,
    clock,
    uow,
  );
  const run = () => handler.execute(new IssueMonthlyInvoicesCommand(ENTITY_ID, CLOSURE));
  return { reader, invoices, outcomes, quotes, durable, events, cancelled, run };
}

describe("IssueMonthlyInvoices — le devis de période (P2 bis)", () => {
  it("un payeur sur devis : un devis v1 rangé, aucune facture, aucune issue, son fait durable", async () => {
    const h = harness();
    const orders = [bon(ARMY), bon(ARMY)];
    h.reader.orders = orders;

    const report = await h.run();

    expect(report).toMatchObject({ issued: [], blocked: [], quoted: 1 });
    expect(h.invoices.inserted).toEqual([]);
    expect(h.outcomes.rows.size).toBe(0);
    expect(h.events.traced).toEqual([]);
    const [quote] = h.quotes.all();
    expect(quote).toMatchObject({
      number: "D-20260930-1",
      version: 1,
      state: "awaiting",
      payerCompanyId: ARMY,
      orderIds: orders.map((order) => order.orderId),
      periodClosesAt: new Date(CLOSURE),
      ...periodQuoteFigures(orders),
    });
    expect(h.durable.facts).toEqual([
      {
        type: PERIOD_QUOTE_ISSUED,
        key: `${PERIOD_QUOTE_ISSUED}:${quote?.id ?? ""}`,
        payload: { quoteId: quote?.id },
      },
    ]);
  });

  it("rejouée : rien n'est rangé deux fois, rien n'est émis", async () => {
    const h = harness();
    h.reader.orders = [bon(ARMY)];
    await h.run();

    const replay = await h.run();

    expect(replay).toMatchObject({ issued: [], blocked: [], quoted: 0 });
    expect(h.quotes.all()).toHaveLength(1);
    expect(h.invoices.inserted).toEqual([]);
  });

  it("un autre payeur de la même clôture, à la commande : sa facture part comme aujourd'hui", async () => {
    const h = harness();
    const school = bon(SCHOOL, { budgetCommitment: { number: "1300012345", serviceCode: "" } });
    h.reader.orders = [bon(ARMY), school];

    const report = await h.run();

    expect(report.quoted).toBe(1);
    expect(report.issued.map((issued) => issued.payerCompanyId)).toEqual([SCHOOL]);
    expect(
      h.invoices.inserted.map((invoice) => invoice.toState().orders.map((o) => o.orderId)),
    ).toEqual([[school.orderId]]);
    expect(h.durable.facts.map((fact) => fact.type)).toEqual([PERIOD_QUOTE_ISSUED, INVOICE_ISSUED]);
  });

  it("une commande non facturable reste hors du devis, signalée comme aujourd'hui (v5 B3)", async () => {
    const h = harness();
    const billable = bon(ARMY);
    const held = bon(ARMY, { settlement: "awaiting_remainder" });
    h.reader.orders = [billable, held];

    const report = await h.run();

    expect(h.quotes.all()[0]?.orderIds).toEqual([billable.orderId]);
    expect(report.blocked).toHaveLength(1);
    const signalled = h.outcomes.rows.get(invoiceGroupKey(ARMY, null, null));
    expect(signalled?.invoiceId).toBeNull();
    expect(signalled?.key.unbillableOrders).toEqual([held.orderNumber]);
    expect(h.reader.quotedOrders.has(held.orderId)).toBe(false);
  });

  it("une commande sur devis qui porte déjà un numéro s'émet : il n'y a rien à attendre", async () => {
    const h = harness();
    const numbered = bon(ARMY, { budgetCommitment: { number: "1300099999", serviceCode: "" } });
    h.reader.orders = [numbered];

    const report = await h.run();

    expect(report.quoted).toBe(0);
    expect(report.issued).toHaveLength(1);
    expect(h.quotes.all()).toEqual([]);
  });

  it("une commande annulée avant le verrou n'entre pas au devis", async () => {
    const h = harness();
    const kept = bon(ARMY);
    const cancelled = bon(ARMY);
    h.reader.orders = [kept, cancelled];
    h.cancelled.numbers = [cancelled.orderNumber];

    await h.run();

    expect(h.quotes.all()[0]).toMatchObject({
      orderIds: [kept.orderId],
      ...periodQuoteFigures([kept]),
    });
  });

  it("la base ne prend qu'une partie des commandes : empreinte et total sur celles-là (v5 S4)", async () => {
    const h = harness();
    const [kept, taken] = [bon(ARMY), bon(ARMY)];
    h.reader.orders = [kept, taken];
    h.quotes.takenElsewhere.add(taken.orderId);

    const report = await h.run();

    expect(report.quoted).toBe(1);
    expect(h.quotes.all()[0]).toMatchObject({
      orderIds: [kept.orderId],
      ...periodQuoteFigures([kept]),
    });
  });

  it("la base n'en prend aucune : rien n'est rangé, le payeur est signalé, les autres continuent", async () => {
    const h = harness();
    const taken = bon(ARMY);
    const school = bon(SCHOOL, { budgetCommitment: { number: "1300012345", serviceCode: "" } });
    h.reader.orders = [taken, school];
    h.quotes.takenElsewhere.add(taken.orderId);

    const report = await h.run();

    expect(report.quoted).toBe(0);
    expect(report.blocked.map((blocked) => blocked.payerCompanyId)).toEqual([ARMY]);
    expect(report.blocked[0]?.message).toContain("rangées dans un autre devis");
    expect(report.issued.map((issued) => issued.payerCompanyId)).toEqual([SCHOOL]);
    expect(h.durable.facts.map((fact) => fact.type)).toEqual([INVOICE_ISSUED]);
  });
});
