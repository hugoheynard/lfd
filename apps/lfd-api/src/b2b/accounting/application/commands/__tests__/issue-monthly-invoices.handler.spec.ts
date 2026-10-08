import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoicingNotYetOpenError,
  MonthNotYetInvoiceableError,
  NotTheInvoicingEntityError,
} from "../../../domain/errors/monthly-invoice-errors.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
import {
  CREDITOR,
  ENTITY_ID,
  frozenOrder,
  mandate,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import type { InvoiceableOrder } from "../../../domain/services/monthly-invoicing.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { IssueMonthlyInvoicesCommand } from "../issue-monthly-invoices.command.js";
import { IssueMonthlyInvoicesHandler } from "../issue-monthly-invoices.handler.js";
import { FakeMandates, FixedBuyers, FixedCreditors, UlidSequence } from "./collection-doubles.js";
import {
  CountingNumbering,
  FakeMonthlyReader,
  FixedIssuers,
  MemoryInvoices,
  MemoryOutcomes,
  NoHandovers,
  NoStops,
} from "./monthly-invoice-doubles.js";

/**
 * La facture du mois (lot E4) — l'orchestration, ports doublés à la main.
 * Les dates sont le SUJET : l'horloge est FIXE et posée par rapport au mois
 * demandé, aucune ne se compare au calendrier réel.
 */

const MONTH = "2026-09";
/** Le 30 septembre 2026 à 22h05, heure de Paris. */
const AFTER_MOMENT = new Date("2026-09-30T20:05:00.000Z");
const FLOOR = new Date("2026-08-31T22:00:00.000Z");

let seq = 0;
function bon(companyId: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  seq += 1;
  const orderNumber = `CMD-${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `o${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    billedCompanyId: null,
    frozen: frozenOrder(orderNumber, placedAt),
    ...overrides,
  };
}

/** Un acheteur sans SIREN : la fiche est incomplète, l'émission refuse. */
class BuyersWithout extends StatementBuyerReader {
  constructor(private readonly incomplete: string) {
    super();
  }
  async buyersOf(ids: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    const all = await new FixedBuyers().buyersOf(ids);
    return new Map(
      [...all.entries()].map(([id, buyer]) => [
        id,
        id === this.incomplete ? { ...buyer, siren: "" } : buyer,
      ]),
    );
  }
}

function harness(options: { buyers?: StatementBuyerReader; at?: Date } = {}) {
  const invoices = new MemoryInvoices();
  const outcomes = new MemoryOutcomes();
  const reader = new FakeMonthlyReader(invoices, outcomes);
  reader.floorAt = FLOOR;
  const mandates = new FakeMandates();
  mandates.mandates = [mandate("c_principal"), mandate("c_port")];
  const clock = new FixedClock(options.at ?? AFTER_MOMENT);
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const issuer = new InvoiceIssuer(new CountingNumbering(), invoices, clock, events, uow);
  const handler = new IssueMonthlyInvoicesHandler(
    reader,
    new FixedCreditors(CREDITOR),
    new FixedIssuers([SELLER_FACTS]),
    options.buyers ?? new FixedBuyers(),
    mandates,
    new NoHandovers(),
    new NoStops(),
    issuer,
    outcomes,
    new UlidSequence(),
    clock,
    uow,
  );
  const run = () => handler.execute(new IssueMonthlyInvoicesCommand(ENTITY_ID, MONTH));
  return { reader, invoices, outcomes, events, run };
}

const CHALET_FOLLOWS_PRINCIPAL = {
  companyId: "c_chalet",
  payerId: "c_principal",
  payerName: "Société c_principal",
  validFrom: new Date("2026-08-01T00:00:00.000Z"),
  validTo: null,
};

describe("IssueMonthlyInvoices — la facture du mois (E4)", () => {
  it("une facture par payeur légal : le site va sur celle de son principal", async () => {
    const h = harness();
    h.reader.follows = [CHALET_FOLLOWS_PRINCIPAL];
    h.reader.orders = [bon("c_chalet"), bon("c_principal"), bon("c_port")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_principal", "c_port"]);
    const [principal] = h.invoices.inserted.map((invoice) => invoice.toState());
    expect(principal?.buyer.companyId).toBe("c_principal");
    expect(principal?.orders.map((order) => order.reference)).toEqual(["CMD-001", "CMD-002"]);
    expect(h.events.factTypes()).toEqual(["invoice.issued", "invoice.issued"]);
    expect(h.reader.asked).toEqual([{ from: FLOOR, to: new Date("2026-09-30T22:00:00.000Z") }]);
  });

  it("datée du dernier jour du mois, échéance au prélèvement, mandat figé (BG-16)", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port")];

    await h.run();

    const state = h.invoices.inserted[0]?.toState();
    expect(state?.issuedOn).toBe("2026-09-30");
    // Clôture le 1er octobre + 14 jours de pré-notification : le jeudi 15.
    expect(state?.dueOn).toBe("2026-10-15");
    expect(state?.paymentMeans).toEqual({ code: "59", mandateReference: "RUM-c_port" });
    expect(h.outcomes.rows.get("c_port")?.invoiceId).toBe(state?.id);
  });

  it("un payeur refusé est SIGNALÉ, rangé, et les autres sont facturés", async () => {
    const h = harness({ buyers: new BuyersWithout("c_principal") });
    h.reader.orders = [bon("c_principal"), bon("c_port")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(report.blocked.map((issue) => issue.payerCompanyId)).toEqual(["c_principal"]);
    const signaled = h.outcomes.rows.get("c_principal");
    expect(signaled?.invoiceId).toBeNull();
    expect(signaled?.message).toContain("SIREN");
  });

  it("rejouer ne facture personne deux fois — le rejeu le dit", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port"), bon("c_principal")];
    await h.run();

    const replay = await h.run();

    expect(replay.issued).toEqual([]);
    expect(h.invoices.inserted).toHaveLength(2);
  });

  it("un bon passé après l'émission (22h-minuit) attend le mois suivant, pas une seconde facture", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port")];
    await h.run();
    h.reader.orders = [...h.reader.orders, bon("c_port")];

    const replay = await h.run();

    expect(replay.issued).toEqual([]);
    expect(replay.alreadyInvoiced).toBe(1);
    expect(h.invoices.inserted).toHaveLength(1);
  });

  it("un payeur signalé est facturé au rejeu, une fois sa fiche corrigée", async () => {
    const first = harness({ buyers: new BuyersWithout("c_port") });
    first.reader.orders = [bon("c_port")];
    expect((await first.run()).blocked).toHaveLength(1);

    // Même mémoire, fiche corrigée : un second handler sur les mêmes doublés.
    const fixed = harness();
    fixed.reader.orders = first.reader.orders;
    first.outcomes.rows.forEach((row, key) => fixed.outcomes.rows.set(key, row));

    expect((await fixed.run()).issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(fixed.outcomes.rows.get("c_port")?.message).toBeNull();
  });

  it("un bon non facturable est signalé, hors de la facture ; seul, il signale le payeur", async () => {
    const h = harness();
    const good = bon("c_port");
    const broken = bon("c_port");
    const lonely = bon("c_principal");
    const unbillable = (order: InvoiceableOrder): InvoiceableOrder => ({
      ...order,
      frozen: { ...order.frozen, lateFeeCents: 100, lateFeeVatRate: null },
    });
    h.reader.orders = [good, unbillable(broken), unbillable(lonely)];

    const report = await h.run();

    expect(report.unbillableOrders).toBe(2);
    expect(h.invoices.inserted[0]?.toState().orders.map((o) => o.orderId)).toEqual([good.orderId]);
    expect(h.outcomes.rows.get("c_port")?.key.unbillableOrders).toEqual([broken.orderNumber]);
    expect(h.outcomes.rows.get("c_principal")?.message).toContain(lonely.orderNumber);
  });

  it("émise après le mois (bouton le 2) : datée du jour réel, jamais antidatée", async () => {
    // Le 2 octobre 2026, 10h à Paris.
    const h = harness({ at: new Date("2026-10-02T08:00:00.000Z") });
    h.reader.orders = [bon("c_port"), bon("c_quai")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.issuedOn)).toEqual(["2026-10-02", "2026-10-02"]);
    expect(h.invoices.inserted.map((invoice) => invoice.number)).toEqual([
      "FA-2026-000001",
      "FA-2026-000002",
    ]);
    // La période facturée reste septembre : la clôture du 1er octobre borne les bons.
    expect(h.reader.asked).toEqual([{ from: FLOOR, to: new Date("2026-09-30T22:00:00.000Z") }]);
  });

  it("avant le dernier jour 22h : refus, rien n'est lu", async () => {
    const h = harness({ at: new Date("2026-09-30T19:59:00.000Z") });

    await expect(h.run()).rejects.toThrow(MonthNotYetInvoiceableError);
    expect(h.reader.asked).toEqual([]);
  });

  it("un mois clos avant la mise en service ne se facture pas (il garde l'arrêté)", async () => {
    const h = harness();
    h.reader.floorAt = new Date("2026-10-31T23:00:00.000Z");

    await expect(h.run()).rejects.toThrow(InvoicingNotYetOpenError);
  });

  it("refuse sous une entité qui n'est pas la seule en service", async () => {
    const h = harness();
    const other = new IssueMonthlyInvoicesCommand("le_other", MONTH);

    await expect(
      new IssueMonthlyInvoicesHandler(
        h.reader,
        new FixedCreditors({ ...CREDITOR, legalEntityId: "le_other" }),
        new FixedIssuers([SELLER_FACTS]),
        new FixedBuyers(),
        new FakeMandates(),
        new NoHandovers(),
        new NoStops(),
        new InvoiceIssuer(
          new CountingNumbering(),
          h.invoices,
          new FixedClock(AFTER_MOMENT),
          h.events,
          new DirectUnitOfWork(),
        ),
        h.outcomes,
        new UlidSequence(),
        new FixedClock(AFTER_MOMENT),
        new DirectUnitOfWork(),
      ).execute(other),
    ).rejects.toThrow(NotTheInvoicingEntityError);
  });
});
