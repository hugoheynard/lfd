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
import {
  invoiceGroupKey,
  type InvoiceableOrder,
} from "../../../domain/services/monthly-invoicing.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { RecordingDurable } from "./notice-doubles.js";
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
/** Le 30 septembre 2026 à 23h56, heure de Paris (E4b : l'émission est à 23h55). */
const AFTER_MOMENT = new Date("2026-09-30T21:56:00.000Z");
const FLOOR = new Date("2026-08-31T22:00:00.000Z");

/** Les clés d'issue (payeur × mandat effectif, E4b) des deux payeurs mandatés. */
const PORT = invoiceGroupKey("c_port", "m_c_port");
const PRINCIPAL = invoiceGroupKey("c_principal", "m_c_principal");

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
  const durable = new RecordingDurable();
  const issuer = new InvoiceIssuer(new CountingNumbering(), invoices, clock, events, uow, durable);
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
  return { reader, invoices, outcomes, events, durable, mandates, run };
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
    // E6 : chaque facture émise écrit son fait durable, qui fera partir l'e-mail.
    expect(h.durable.facts.map((fact) => fact.key)).toEqual(
      h.invoices.inserted.map((invoice) => `invoice.issued:${invoice.id}`),
    );
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
    expect(h.outcomes.rows.get(PORT)?.invoiceId).toBe(state?.id);
  });

  it("un payeur refusé est SIGNALÉ, rangé, et les autres sont facturés", async () => {
    const h = harness({ buyers: new BuyersWithout("c_principal") });
    h.reader.orders = [bon("c_principal"), bon("c_port")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(report.blocked.map((issue) => issue.payerCompanyId)).toEqual(["c_principal"]);
    const signaled = h.outcomes.rows.get(PRINCIPAL);
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

  it("un bon passé après l'émission (23h55-minuit) attend le mois suivant, pas une seconde facture", async () => {
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
    expect(fixed.outcomes.rows.get(PORT)?.message).toBeNull();
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
    expect(h.outcomes.rows.get(PORT)?.key.unbillableOrders).toEqual([broken.orderNumber]);
    expect(h.outcomes.rows.get(PRINCIPAL)?.message).toContain(lonely.orderNumber);
  });

  it("des bons sur deux mandats : une facture par mandat, chacune sous SA RUM (E4b)", async () => {
    const h = harness();
    h.reader.follows = [CHALET_FOLLOWS_PRINCIPAL];
    h.reader.forms = new Map([["c_chalet", "own_mandate_principal_iban" as const]]);
    h.mandates.mandates = [
      mandate("c_principal"),
      mandate("c_chalet", { debtorCompanyId: "c_principal", reference: "RUM-chalet" }),
    ];
    const chalet = bon("c_chalet");
    const principal = bon("c_principal");
    const chaletAgain = bon("c_chalet");
    h.reader.orders = [chalet, principal, chaletAgain];

    const report = await h.run();

    const states = h.invoices.inserted.map((invoice) => invoice.toState());
    // Le payeur légal est le même ; l'ordre est celui du premier bon de chaque facture.
    expect(states.map((state) => state.buyer.companyId)).toEqual(["c_principal", "c_principal"]);
    expect(states.map((state) => state.paymentMeans?.mandateReference)).toEqual([
      "RUM-chalet",
      "RUM-c_principal",
    ]);
    expect(states.map((state) => state.orders.map((order) => order.reference))).toEqual([
      [chalet.orderNumber, chaletAgain.orderNumber],
      [principal.orderNumber],
    ]);
    expect(report.issued.map((issue) => issue.number)).toEqual([
      "FA-2026-000001",
      "FA-2026-000002",
    ]);
    expect(h.outcomes.rows.get(invoiceGroupKey("c_principal", "m_c_chalet"))?.key).toMatchObject({
      mandateReference: "RUM-chalet",
    });
    expect(h.outcomes.rows.get(PRINCIPAL)?.invoiceId).toBe(states[1]?.id);
  });

  it("les bons sans mandat effectif font leur facture, sans moyen de paiement", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port"), bon("c_quai")];

    await h.run();

    expect(h.invoices.inserted.map((invoice) => invoice.toState().paymentMeans)).toEqual([
      { code: "59", mandateReference: "RUM-c_port" },
      null,
    ]);
    expect(h.outcomes.rows.get(invoiceGroupKey("c_quai", null))?.invoiceId).not.toBeNull();
  });

  it("au rejeu, une facture déjà émise est sautée et l'autre mandat est repris", async () => {
    const h = harness();
    h.reader.follows = [CHALET_FOLLOWS_PRINCIPAL];
    h.reader.forms = new Map([["c_chalet", "own_mandate_principal_iban" as const]]);
    h.reader.orders = [bon("c_principal")];
    await h.run();
    // Le mandat du site est signé ensuite ; son bon n'était pas encore là.
    h.mandates.mandates = [
      mandate("c_principal"),
      mandate("c_chalet", { debtorCompanyId: "c_principal", reference: "RUM-chalet" }),
    ];
    h.reader.orders = [...h.reader.orders, bon("c_chalet"), bon("c_principal")];

    const replay = await h.run();

    expect(replay.alreadyInvoiced).toBe(1);
    expect(replay.issued).toHaveLength(1);
    expect(h.invoices.inserted.at(-1)?.toState().paymentMeans?.mandateReference).toBe("RUM-chalet");
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

  it("avant le dernier jour 23h55 : refus, rien n'est lu — 22h ne suffit plus (E4b)", async () => {
    const h = harness({ at: new Date("2026-09-30T21:54:00.000Z") });

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
          new RecordingDurable(),
        ),
        h.outcomes,
        new UlidSequence(),
        new FixedClock(AFTER_MOMENT),
        new DirectUnitOfWork(),
      ).execute(other),
    ).rejects.toThrow(NotTheInvoicingEntityError);
  });
});
