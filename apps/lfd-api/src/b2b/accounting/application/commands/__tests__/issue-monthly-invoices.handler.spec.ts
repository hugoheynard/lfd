import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { mandateReferenceOf } from "../../../domain/entities/invoice.types.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { StatementBuyer } from "../../../domain/entities/billing-statement.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  InvoicingNotYetOpenError,
  NotABillingClosureError,
  NotTheInvoicingEntityError,
  PeriodNotYetInvoiceableError,
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
import type { PayerModeSegments } from "../../../domain/ports/payer-billing-modes.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { RecordingDurable } from "./notice-doubles.js";
import { IssueMonthlyInvoicesCommand } from "../issue-monthly-invoices.command.js";
import { IssueMonthlyInvoicesHandler } from "../issue-monthly-invoices.handler.js";
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
  FakeMonthlyReader,
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
  MemoryInvoices,
  MemoryOutcomes,
} from "./monthly-invoice-doubles.js";

/**
 * La facture par période (lot E4, par clôture depuis R3) — l'orchestration,
 * ports doublés à la main. Les dates sont le SUJET : l'horloge est FIXE et
 * posée par rapport à la clôture demandée, aucune ne se compare au
 * calendrier réel.
 */

/** Le mois que le journal lit encore (`periodMonthOf`). */
const MONTH = "2026-09";
/** Le 1er octobre 2026 à 00h00, heure de Paris : la clôture de septembre (mensuel au 1er). */
const CLOSURE = "2026-09-30T22:00:00.000Z";
/** Le 30 septembre 2026 à 23h56, heure de Paris (E4b : l'émission est à 23h55). */
const AFTER_MOMENT = new Date("2026-09-30T21:56:00.000Z");
const FLOOR = new Date("2026-08-31T22:00:00.000Z");

/** Les clés d'issue (payeur × mandat effectif, E4b) des deux payeurs mandatés. */
const PORT = invoiceGroupKey("c_port", "m_c_port");
const PRINCIPAL = invoiceGroupKey("c_principal", "m_c_principal");
/** Le jour de réception des bons (`orders.received_on`) — dans la période facturée. */
const RECEIVED_ON = "2026-09-16";

let seq = 0;
function bon(companyId: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  seq += 1;
  const orderNumber = `ORD-${String(seq).padStart(3, "0")}`;
  const placedAt = new Date("2026-09-15T08:00:00.000Z");
  return {
    orderId: `o${String(seq)}`,
    orderNumber,
    companyId,
    placedAt,
    receivedOn: RECEIVED_ON,
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

function harness(
  options: {
    buyers?: StatementBuyerReader;
    at?: Date;
    /** Les payeurs qui ont choisi un mode ; aucun : tous mensuels au 1er. */
    payers?: readonly PayerModeSegments[];
    closure?: string;
  } = {},
) {
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
  const steps = { log: [] as string[] };
  const rows = new RecordingRowsLock(steps);
  const cancelled = new FakeCancelled();
  const handler = new IssueMonthlyInvoicesHandler(
    reader,
    new FixedModeDates(),
    new FixedPayerModes(options.payers),
    new FixedCreditors(CREDITOR),
    new FixedIssuers([SELLER_FACTS]),
    options.buyers ?? new FixedBuyers(),
    mandates,
    issuer,
    outcomes,
    rows,
    cancelled,
    new UlidSequence(),
    events,
    clock,
    uow,
  );
  const run = () =>
    handler.execute(new IssueMonthlyInvoicesCommand(ENTITY_ID, options.closure ?? CLOSURE));
  return { reader, invoices, outcomes, events, durable, mandates, run, steps, cancelled };
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
    expect(principal?.orders.map((order) => order.reference)).toEqual(["ORD-001", "ORD-002"]);
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
    expect(state?.paymentMeans).toEqual({ code: "59", mandateReference: "RUM-c-port" });
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

  it("un payeur signalé est journalisé `invoice.signalled` : sa raison, jamais un montant", async () => {
    const h = harness({ buyers: new BuyersWithout("c_principal") });
    h.reader.orders = [bon("c_principal"), bon("c_port")];

    await h.run();

    expect([...h.events.factTypes()].sort()).toEqual(["invoice.issued", "invoice.signalled"]);
    const signalled = h.events.traced
      .map((event) => event.journalFact())
      .find((fact) => fact.type === "invoice.signalled");
    expect(signalled).toMatchObject({
      subjectType: "company",
      subjectId: "c_principal",
      payload: {
        month: MONTH,
        periodLabel: "du 1er au 30 septembre 2026",
        reason: h.outcomes.rows.get(PRINCIPAL)?.message,
      },
    });
    expect(Object.keys(signalled?.payload ?? {}).sort()).toEqual([
      "month",
      "periodClosesAt",
      "periodLabel",
      "reason",
      "subjectLabel",
    ]);
  });

  it("un payeur facturé n'écrit aucun `invoice.signalled`", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port")];

    await h.run();

    expect(h.events.factTypes()).toEqual(["invoice.issued"]);
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
    expect(h.events.factTypes().filter((type) => type === "invoice.signalled")).toHaveLength(1);
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
    expect(states.map((state) => mandateReferenceOf(state.paymentMeans))).toEqual([
      "RUM-chalet",
      "RUM-c-principal",
    ]);
    expect(states.map((state) => state.orders.map((order) => order.reference))).toEqual([
      [chalet.orderNumber, chaletAgain.orderNumber],
      [principal.orderNumber],
    ]);
    expect(report.issued.map((issue) => issue.number)).toEqual([
      "FA-LFD-2026-000001",
      "FA-LFD-2026-000002",
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
      { code: "59", mandateReference: "RUM-c-port" },
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
    expect(mandateReferenceOf(h.invoices.inserted.at(-1)?.toState().paymentMeans ?? null)).toBe(
      "RUM-chalet",
    );
  });

  it("émise après le mois (bouton le 2) : datée du jour réel, jamais antidatée", async () => {
    // Le 2 octobre 2026, 10h à Paris.
    const h = harness({ at: new Date("2026-10-02T08:00:00.000Z") });
    h.reader.orders = [bon("c_port"), bon("c_quai")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.issuedOn)).toEqual(["2026-10-02", "2026-10-02"]);
    expect(h.invoices.inserted.map((invoice) => invoice.number)).toEqual([
      "FA-LFD-2026-000001",
      "FA-LFD-2026-000002",
    ]);
    // La période facturée reste septembre : la clôture du 1er octobre borne les bons.
    expect(h.reader.asked).toEqual([{ from: FLOOR, to: new Date("2026-09-30T22:00:00.000Z") }]);
  });

  it("avant le dernier jour 23h55 : refus, rien n'est lu — 22h ne suffit plus (E4b)", async () => {
    const h = harness({ at: new Date("2026-09-30T21:54:00.000Z") });

    await expect(h.run()).rejects.toThrow(PeriodNotYetInvoiceableError);
    expect(h.reader.asked).toEqual([]);
  });

  it("un mois clos avant la mise en service ne se facture pas (il garde l'arrêté)", async () => {
    const h = harness();
    h.reader.floorAt = new Date("2026-10-31T23:00:00.000Z");

    await expect(h.run()).rejects.toThrow(InvoicingNotYetOpenError);
  });

  it("refuse sous une entité qui n'est pas la seule en service", async () => {
    const h = harness();
    const other = new IssueMonthlyInvoicesCommand("le_other", CLOSURE);

    await expect(
      new IssueMonthlyInvoicesHandler(
        h.reader,
        new FixedModeDates(),
        new FixedPayerModes(),
        new FixedCreditors({ ...CREDITOR, legalEntityId: "le_other" }),
        new FixedIssuers([SELLER_FACTS]),
        new FixedBuyers(),
        new FakeMandates(),
        new InvoiceIssuer(
          new CountingNumbering(),
          h.invoices,
          new FixedClock(AFTER_MOMENT),
          h.events,
          new DirectUnitOfWork(),
          new RecordingDurable(),
        ),
        h.outcomes,
        new RecordingRowsLock({ log: [] }),
        new FakeCancelled(),
        new UlidSequence(),
        h.events,
        new FixedClock(AFTER_MOMENT),
        new DirectUnitOfWork(),
      ).execute(other),
    ).rejects.toThrow(NotTheInvoicingEntityError);
  });

  it("le rapport nomme la période : sa clôture, sa clôture précédente et son libellé", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port")];

    const report = await h.run();

    expect(report).toMatchObject({
      periodClosesAt: CLOSURE,
      periodStartsAt: "2026-08-31T22:00:00.000Z",
      periodLabel: "du 1er au 30 septembre 2026",
    });
    expect(h.outcomes.rows.get(PORT)?.key.periodClosesAt).toEqual(new Date(CLOSURE));
  });

  it("refuse un instant qui n'est pas une clôture du rythme de l'entité, sans rien lire", async () => {
    // Le 15 septembre à 00h00 à Paris : un jour quelconque pour un mensuel au 1er.
    const h = harness({ closure: "2026-09-14T22:00:00.000Z" });

    await expect(h.run()).rejects.toThrow(NotABillingClosureError);
    expect(h.reader.asked).toEqual([]);
  });

  it("payeur hebdomadaire au lundi : sa semaine, émise le dimanche à 23h55", async () => {
    const h = harness({
      payers: [WEEKLY_PORT],
      // Le lundi 28 septembre 2026 à 00h00 à Paris.
      closure: "2026-09-27T22:00:00.000Z",
      // Le dimanche 27 septembre à 23h56.
      at: new Date("2026-09-27T21:56:00.000Z"),
    });
    h.reader.orders = [bon("c_port")];

    const report = await h.run();

    expect(report.periodLabel).toBe("du 21 au 27 septembre 2026");
    expect(report.issued.map((issue) => issue.issuedOn)).toEqual(["2026-09-27"]);
    // M4a : le début de SA période est rangé sur l'issue, pas recalculé au mensuel.
    expect(h.outcomes.rows.get(PORT)?.key.periodStartsAt).toEqual(
      new Date("2026-09-20T22:00:00.000Z"),
    );
    expect(h.reader.asked).toEqual([{ from: FLOOR, to: new Date("2026-09-27T22:00:00.000Z") }]);
  });

  it("hebdomadaire : avant le dimanche 23h55, la semaine court encore", async () => {
    const h = harness({
      payers: [WEEKLY_PORT],
      closure: "2026-09-27T22:00:00.000Z",
      at: new Date("2026-09-27T21:54:00.000Z"),
    });

    await expect(h.run()).rejects.toThrow(PeriodNotYetInvoiceableError);
  });

  it("un lundi sans aucun payeur hebdomadaire n'est pas une clôture de l'entité", async () => {
    const h = harness({
      closure: "2026-09-27T22:00:00.000Z",
      at: new Date("2026-09-27T21:56:00.000Z"),
    });

    await expect(h.run()).rejects.toThrow(NotABillingClosureError);
    expect(h.reader.asked).toEqual([]);
  });

  it("rythmes mêlés, au lundi : seul l'hebdomadaire est facturé, le mensuel attend le 1er", async () => {
    const h = harness({
      payers: [WEEKLY_PORT],
      closure: "2026-09-27T22:00:00.000Z",
      at: new Date("2026-09-27T21:56:00.000Z"),
    });
    h.reader.orders = [bon("c_port"), bon("c_principal")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(report.blocked).toEqual([]);
    expect(h.outcomes.rows.has(PRINCIPAL)).toBe(false);
  });

  it("rythmes mêlés, au 1er : le mensuel a son mois entier, l'hebdomadaire sa fin de semaine (Q-L1)", async () => {
    // Le jeudi 1er octobre 2026 n'est pas un lundi, mais il ferme le mois
    // civil : l'hebdomadaire clôt aussi, sa semaine du 28 est coupée.
    const h = harness({ payers: [WEEKLY_PORT] });
    const weekly = bon("c_port");
    const monthly = bon("c_principal");
    h.reader.orders = [weekly, monthly];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId).sort()).toEqual([
      "c_port",
      "c_principal",
    ]);
    expect(report.periodLabel).toBe("du 1er au 30 septembre 2026");
    expect(
      h.invoices.inserted.map((invoice) => invoice.toState().orders[0]?.orderId).sort(),
    ).toEqual([monthly.orderId, weekly.orderId].sort());
  });

  it("le site d'un payeur hebdomadaire est facturé avec lui, au lundi", async () => {
    const h = harness({
      payers: [{ payerCompanyId: "c_principal", segments: WEEKLY_SINCE_AUGUST }],
      closure: "2026-09-27T22:00:00.000Z",
      at: new Date("2026-09-27T21:56:00.000Z"),
    });
    h.reader.follows = [CHALET_FOLLOWS_PRINCIPAL];
    const chalet = bon("c_chalet");
    h.reader.orders = [chalet, bon("c_port")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_principal"]);
    expect(h.invoices.inserted[0]?.toState().orders.map((o) => o.orderId)).toEqual([
      chalet.orderId,
    ]);
  });

  it("un payeur qui passe à l'hebdomadaire au 1er : facturé au 1er sur son mois, puis sur sa première semaine", async () => {
    // Mensuel jusqu'au 1er octobre, hebdomadaire au lundi ensuite.
    const switching: PayerModeSegments = {
      payerCompanyId: "c_port",
      segments: [{ effectiveFrom: new Date(CLOSURE), mode: "weekly" }],
    };
    const atFirst = harness({ payers: [switching] });
    atFirst.reader.orders = [bon("c_port")];
    expect((await atFirst.run()).issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(atFirst.outcomes.rows.get(PORT)?.key.periodClosesAt).toEqual(new Date(CLOSURE));

    const atMonday = harness({
      payers: [switching],
      // Le lundi 5 octobre 2026 à 00h00 à Paris.
      closure: "2026-10-04T22:00:00.000Z",
      at: new Date("2026-10-04T21:56:00.000Z"),
    });
    atMonday.reader.orders = [
      bon("c_port", {
        placedAt: new Date("2026-10-02T08:00:00.000Z"),
        receivedOn: "2026-10-02",
      }),
    ];

    const report = await atMonday.run();

    expect(report.periodStartsAt).toBe(CLOSURE);
    expect(report.periodLabel).toBe("du 1er au 4 octobre 2026");
    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(atMonday.outcomes.rows.get(PORT)?.key.periodStartsAt).toEqual(new Date(CLOSURE));
  });

  it("le signalement d'un payeur hebdomadaire nomme SA semaine, pas le mois du calendrier", async () => {
    // Le lundi 1er février 2027 : clôture du mensuel ET de l'hebdomadaire.
    const h = harness({
      payers: [WEEKLY_PORT],
      closure: "2027-01-31T23:00:00.000Z",
      at: new Date("2027-01-31T22:56:00.000Z"),
    });
    const broken = bon("c_port");
    h.reader.orders = [
      { ...broken, frozen: { ...broken.frozen, lateFeeCents: 100, lateFeeVatRate: null } },
    ];

    const report = await h.run();

    // La clôture affiche la plus longue des périodes qui s'y closent.
    expect(report.periodLabel).toBe("du 1er au 31 janvier 2027");
    expect(h.outcomes.rows.get(PORT)?.message).toContain("du 25 au 31 janvier 2027");
    // Le journal dit la même semaine que le refus rangé (M4a).
    const signalled = h.events.traced
      .map((event) => event.journalFact())
      .find((fact) => fact.type === "invoice.signalled");
    expect(signalled?.payload).toMatchObject({
      month: "2027-01",
      periodClosesAt: "2027-01-31T23:00:00.000Z",
      periodLabel: "du 25 au 31 janvier 2027",
    });
  });
});

/** Hebdomadaire au lundi depuis le 1er août 2026 (une clôture du mensuel). */
const WEEKLY_SINCE_AUGUST = [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }];
const WEEKLY_PORT: PayerModeSegments = { payerCompanyId: "c_port", segments: WEEKLY_SINCE_AUGUST };

describe("IssueMonthlyInvoices — les annulées entre la préparation et l'émission (lot C5)", () => {
  it("verrouille TOUS les bons du groupe, facturables ou non, avant d'émettre", async () => {
    const h = harness();
    const port = bon("c_port");
    const broken = {
      ...bon("c_port"),
      frozen: { ...port.frozen, lateFeeCents: 100, lateFeeVatRate: null },
    };
    h.reader.orders = [port, broken];

    await h.run();

    expect(h.steps.log).toEqual([`lock:rows:${port.orderId},${broken.orderId}`]);
    expect(h.invoices.inserted).toHaveLength(1);
  });

  it("une annulée est retirée du groupe : la facture porte le reste, sous la même clé", async () => {
    const h = harness();
    const kept = bon("c_port");
    const cancelled = bon("c_port");
    h.reader.orders = [kept, cancelled];
    h.cancelled.numbers = [cancelled.orderNumber];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    const state = h.invoices.inserted[0]?.toState();
    expect(state?.orders.map((order) => order.reference)).toEqual([kept.orderNumber]);
    expect(h.outcomes.rows.get(PORT)?.invoiceId).toBe(state?.id);
  });

  it("toutes annulées : rien d'émis, rien de signalé, aucune issue rangée", async () => {
    const h = harness();
    const only = bon("c_port");
    h.reader.orders = [only];
    h.cancelled.numbers = [only.orderNumber];

    const report = await h.run();

    expect(report.issued).toEqual([]);
    expect(report.blocked).toEqual([]);
    expect(h.invoices.inserted).toEqual([]);
    expect(h.outcomes.rows.size).toBe(0);
    expect(h.events.factTypes()).toEqual([]);
  });

  it("un non facturable annulé n'est plus signalé", async () => {
    const h = harness();
    const port = bon("c_port");
    const broken = {
      ...bon("c_port"),
      frozen: { ...port.frozen, lateFeeCents: 100, lateFeeVatRate: null },
    };
    h.reader.orders = [port, broken];
    h.cancelled.numbers = [broken.orderNumber];

    await h.run();

    expect(h.outcomes.rows.get(PORT)?.key.unbillableOrders).toEqual([]);
  });
});

describe("IssueMonthlyInvoices — la date de livraison (M5, lot ZA)", () => {
  /**
   * M5 (lot ZA) : la date de livraison est obligatoire ; elle ne s'invente pas.
   * Depuis ZL, l'assiette ne rend plus de bon sans `received_on` : le
   * bloqueur reste un FILET, éprouvé ici par un lecteur qui en rendrait un.
   */
  it("un bon sans date de livraison signale son payeur, en nommant le bon et le geste ; les autres sont facturés", async () => {
    const unknown = bon("c_principal", { receivedOn: null });
    const h = harness();
    h.reader.orders = [unknown, bon("c_port")];

    const report = await h.run();

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual(["c_port"]);
    expect(report.blocked.map((issue) => issue.payerCompanyId)).toEqual(["c_principal"]);
    const signalled = h.outcomes.rows.get(PRINCIPAL);
    expect(signalled?.invoiceId).toBeNull();
    expect(signalled?.message).toContain(`Le bon ${unknown.orderNumber} n'a pas de date`);
    expect(signalled?.message).toContain("n'a pas de date de livraison");
    expect(signalled?.message).toContain("Enregistrer son retrait ou sa livraison");
    expect(h.invoices.inserted.map((invoice) => invoice.toState().buyer.companyId)).toEqual([
      "c_port",
    ]);
  });

  it("la facture date chaque bon de SON `received_on` — celui qui l'a fait entrer dans l'assiette", async () => {
    const h = harness();
    h.reader.orders = [bon("c_port")];

    await h.run();

    expect(h.invoices.inserted[0]?.toState().orders.map((order) => order.receivedOn)).toEqual([
      "2026-09-16",
    ]);
  });
});
