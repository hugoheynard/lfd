/**
 * E2E de **la facture du mois, et du lot qui encaisse des factures** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Ce que seul le vrai SQL prouve : le passage de 23h55 émet, le dernier jour,
 * une facture numérotée par payeur et par mandat ; le lot du 1er encaisse ces
 * factures (table de liaison, montant = TTC des factures) sans arrêté ;
 * l'avis annonce ce montant et cite les numéros ; un rejeu ne double rien ;
 * le bouton reprend un payeur signalé ; un lot annulé rend sa facture.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats, plancher : écrits par Prisma, même dette que
 * `collection-autopilot-scene.ts`. Aucune date absolue : le mois est le
 * PRÉCÉDENT du jour du test, ses instants sortent du domaine, et l'horloge
 * FIXE est posée relativement à eux.
 */
import {
  instantToLocal,
  weekdayOf,
  type CollectionCycleView,
  type CollectionProcedureView,
  type CycleStatementView,
  type InvoiceDossierView,
  type UnconfirmedDeliveriesView,
  type IssuedInvoicesView,
  type MonthlyInvoiceReportView,
  type MonthlyInvoicesView,
  type StatementCyclesView,
} from "@lfd/contracts";

import { nextClosureAfter } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import {
  invoicingMomentOf,
  lastDayOf,
  periodLabelOf,
} from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { BillingRhythm } from "../src/b2b/accounting/domain/value-objects/billing-rhythm.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  addBillingAddress,
  attachTo,
  createCompany,
  createUser,
  handOver,
  markDelivered,
} from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ICS = "FR72ZZZ123456";
const RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
const TERMS = {
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "néant",
};
const ENTITIES = "/admin/accounting/legal-entities";
const COLLECTION = "/admin/accounting/collection";
const MONTHLY = "/admin/accounting/monthly-invoices";
const NUMBER = /^FA-LFD-\d{4}-\d{6}$/u;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** `<gabarit> → <destinataire>` : depuis E6, la facture prévient aussi. */
const sentMails: string[] = [];
/** Les données de chaque courriel, dans l'ordre d'envoi (M4a : la période dite). */
const sentData: unknown[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: {
    readonly to: string;
    readonly template: string;
    readonly data?: unknown;
  }): Promise<{ providerId: null }> => {
    sentMails.push(`${args.template} → ${args.to}`);
    sentData.push(args.data);
    return Promise.resolve({ providerId: null });
  },
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let seq = 0;
/** Le mois facturé : celui qui PRÉCÈDE le jour du test. */
let month: StatementMonth;
let issuableFrom: Date;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
  sentData.splice(0);
  // La base est purgée : les RUM et les comptes repartent de 1 à chaque test.
  seq = 0;
  month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  issuableFrom = invoicingMomentOf(closesAt);
  // Le dernier jour du mois, 23h57 à Paris : la facture du mois est due
  // (23h55, E4b), la clôture de minuit n'est pas atteinte.
  clock.set(new Date(issuableFrom.getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** L'entité, complète, mentions de facture posées, automatisme activé. */
async function entity(): Promise<string> {
  const response = await staff()
    .post(ENTITIES)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff().put(`${ENTITIES}/${id}/creditor-identifier`).send({ ics: ICS }).expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
    .expect(204);
  await staff().put(`${ENTITIES}/${id}/invoice-payment-terms`).send(TERMS).expect(204);
  await staff().put(`${ENTITIES}/${id}/invoice-prefix`).send({ prefix: "LFD" }).expect(204);
  await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: true }).expect(204);
  return id;
}

/** Un payeur au compte : mandat B2B actif, détenteur joignable, un bon du mois. */
async function payer(
  entityId: string,
  options: {
    readonly siren?: string;
    readonly billingAddress?: boolean;
    /** `false` : le bon n'a jamais été remis — ni retrait, ni `received_on`. */
    readonly handedOver?: boolean;
  } = {},
) {
  seq += 1;
  const company = await createCompany(ctx.prisma, {
    raisonSociale: `Boulangerie ${String(seq)}`,
    ...(options.siren === undefined ? {} : { siren: options.siren }),
  });
  if (options.billingAddress !== false) {
    await addBillingAddress(ctx.prisma, company.id);
  }
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-E4-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const owner = await createUser(ctx.prisma, {
    auth0Sub: `e4-owner-${String(seq)}`,
    email: `patron${String(seq)}@port.test`,
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const placedOrder = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-E4-${String(seq)}`,
      companyId: company.id,
      placedByUserId: owner.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-E4",
          productNameSnapshot: "Pain du mois",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true, orderNumber: true, createdAt: true },
  });
  if (options.handedOver !== false) {
    await handOver(ctx.prisma, placedOrder);
  }
  return company;
}

interface HourlyReport {
  readonly runs: readonly { readonly outcome: string }[];
  readonly invoiceRuns: readonly { readonly periodClosesAt: string; readonly outcome: string }[];
}

/** Un passage du cron horaire, jeton présenté ; attend la livraison des avis. */
async function pass(): Promise<HourlyReport> {
  const response = await ctx
    .http()
    .post(`${COLLECTION}/autopilot`)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<HourlyReport>(response);
}

/** Le cron de 23h55 (E4b) : la facture du mois SEULE, jamais le lot. */
async function invoicePass(): Promise<{ readonly runs: readonly unknown[] }> {
  const response = await ctx
    .http()
    .post(`${MONTHLY}/autopilot`)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<{ readonly runs: readonly unknown[] }>(response);
}

async function view(entityId: string): Promise<MonthlyInvoicesView> {
  return jsonBody<MonthlyInvoicesView>(
    await staff().get(`${MONTHLY}?legalEntityId=${entityId}`).expect(200),
  );
}

async function issueByHand(
  entityId: string,
  closure: Date = closesAt,
): Promise<MonthlyInvoiceReportView> {
  return jsonBody<MonthlyInvoiceReportView>(
    await staff()
      .post(MONTHLY)
      .send({ legalEntityId: entityId, periodClosesAt: closure.toISOString() })
      .expect(200),
  );
}

describe("la facture du mois, puis le lot qui l'encaisse (E4)", () => {
  it("un mois complet : la facture à 23h55, le lot du 1er au montant des factures, l'avis qui les cite", async () => {
    const id = await entity();
    const company = await payer(id);

    const evening = await invoicePass();

    expect(evening.runs).toEqual([
      { legalEntityId: id, periodClosesAt: closesAt.toISOString(), outcome: "issued" },
    ]);
    // Le passage de 23h55 ne prépare pas le lot : la clôture n'est pas atteinte.
    expect(await ctx.prisma.collectionBatch.count()).toBe(0);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });
    expect(invoice.number).toMatch(NUMBER);
    expect(invoice.issuedOn.toISOString().slice(0, 10)).toBe(lastDayOf(closesAt));
    expect(invoice.paymentMeans).toEqual({ code: "59", mandateReference: "RUM-E4-1" });
    // Le passage est au journal, issue et nombres compris, auteur système.
    const ran = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "invoice.autopilot_ran", subjectId: id },
    });
    expect(ran).toMatchObject({ actorType: "system", subjectType: "legal_entity" });
    expect(ran.payload).toMatchObject({
      month: month.toString(),
      outcome: "issued",
      issuedCount: 1,
      signalledCount: 0,
      message: null,
    });

    // Le 1er, deux heures après la clôture : le lot.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    const morning = await pass();

    expect(morning.runs.map((run) => run.outcome)).toEqual(["constituted"]);
    expect(morning.invoiceRuns).toEqual([]);
    const line = await ctx.prisma.collectionBatchLine.findFirstOrThrow({
      include: { invoices: true, statement: true },
    });
    expect(line.amountCents).toBe(invoice.totalTtcCents);
    expect(line.invoices.map((link) => link.invoiceId)).toEqual([invoice.id]);
    expect(line.statement).toBeNull();
    expect(await ctx.prisma.billingStatement.count()).toBe(0);
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow();
    expect(notice).toMatchObject({
      amountCents: invoice.totalTtcCents,
      invoiceNumbers: [invoice.number],
      statementId: null,
      status: "sent",
    });
    // La facture prévient le soir (E6), l'avis de prélèvement part le matin.
    expect(sentMails).toEqual([
      "customer.invoice-issued → patron1@port.test",
      "customer.collection-notice → patron1@port.test",
    ]);
    const cycle = jsonBody<{ batches: { lines: { invoiceNumbers: string[] }[] }[] }>(
      await staff().get(`${COLLECTION}/cycle?legalEntityId=${id}`).expect(200),
    );
    expect(cycle.batches[0]?.lines[0]?.invoiceNumbers).toEqual([invoice.number]);
  });

  it("le passage horaire de 23h15 le dernier jour n'émet pas le mois (E4b)", async () => {
    const id = await entity();
    await payer(id);
    clock.set(new Date(issuableFrom.getTime() - 40 * 60 * 1000));

    await pass();

    expect(await ctx.prisma.invoice.count()).toBe(0);
  });

  it("le cron rejoué ne refait rien : une tentative par mois, une facture par payeur", async () => {
    const id = await entity();
    await payer(id);
    await pass();

    expect((await pass()).invoiceRuns).toEqual([]);
    expect(await ctx.prisma.invoice.count()).toBe(1);
    expect(await ctx.prisma.invoiceAutopilotRun.count()).toBe(1);
  });

  it("le bouton émet la même chose, et le rejouer le dit sans rien doubler", async () => {
    const id = await entity();
    const company = await payer(id);

    const first = await issueByHand(id);
    expect(first.issued).toEqual([
      {
        payerCompanyId: company.id,
        number: expect.stringMatching(NUMBER) as string,
        issuedOn: lastDayOf(closesAt),
      },
    ]);

    const replay = await issueByHand(id);
    expect(replay).toMatchObject({ issued: [], blocked: [], alreadyInvoiced: 1 });
    expect(await ctx.prisma.invoice.count()).toBe(1);
    const screen = await view(id);
    expect(screen).toMatchObject({
      periodClosesAt: closesAt.toISOString(),
      periodStartsAt: month.cycle().startsAt.toISOString(),
    });
    expect(screen.invoices.map((invoice) => invoice.payerCompanyId)).toEqual([company.id]);
    expect(screen.invoices[0]?.mandateReference).toBe("RUM-E4-1");
  });

  it("un payeur sans SIREN est signalé et rangé ; le bouton le reprend une fois sa fiche complétée", async () => {
    const id = await entity();
    const complete = await payer(id);
    const incomplete = await payer(id);
    const legal = { siren: incomplete.siren, siret: incomplete.siret };
    await ctx.prisma.company.update({
      where: { id: incomplete.id },
      data: { siren: "", siret: "" },
    });

    const report = await issueByHand(id);

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual([complete.id]);
    expect(report.blocked.map((issue) => issue.payerCompanyId)).toEqual([incomplete.id]);
    const signaled = (await view(id)).signaled;
    expect(signaled.map((row) => row.payerCompanyId)).toEqual([incomplete.id]);
    expect(signaled[0]?.message).toContain("SIREN");
    // Le payeur signalé est au journal : sa raison, jamais un montant.
    const flagged = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "invoice.signalled", subjectId: incomplete.id },
    });
    expect(flagged.subjectType).toBe("company");
    expect(flagged.payload).toMatchObject({
      month: month.toString(),
      reason: signaled[0]?.message,
    });
    expect(Object.keys(flagged.payload ?? {}).sort()).toEqual([
      "month",
      "periodClosesAt",
      "periodLabel",
      "reason",
      "subjectLabel",
    ]);

    await ctx.prisma.company.update({
      where: { id: incomplete.id },
      data: legal,
    });
    const retry = await issueByHand(id);

    expect(retry.issued.map((issue) => issue.payerCompanyId)).toEqual([incomplete.id]);
    expect((await view(id)).signaled).toEqual([]);
    const numbers = (await ctx.prisma.invoice.findMany({ orderBy: { rank: "asc" } })).map(
      (i) => i.rank,
    );
    expect(numbers).toEqual([1, 2]);
  });

  /** A43 (Hugo, 2026-10-09) : sans adresse, pas de pays acheteur — BR-10/BR-11. */
  it("un payeur sans adresse de facturation est signalé, pas facturé", async () => {
    const id = await entity();
    const complete = await payer(id);
    const homeless = await payer(id, { billingAddress: false });

    const report = await issueByHand(id);

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual([complete.id]);
    expect(report.blocked.map((issue) => issue.payerCompanyId)).toEqual([homeless.id]);
    const signaled = (await view(id)).signaled;
    expect(signaled.map((row) => row.payerCompanyId)).toEqual([homeless.id]);
    expect(signaled[0]?.message).toContain("ajoutez l'adresse de facturation");
    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: homeless.id } })).toBe(0);
  });

  /** M5 (plan `plan-zero-faille.md`, lot ZA) : la date de livraison ne s'invente pas. */
  /**
   * Lot ZL : ce test éprouvait le bloqueur M5 (lot ZA) — un bon sans date de
   * livraison bloquait la facture de son payeur. Un bon jamais remis n'est
   * plus dans l'assiette : il ne bloque personne, n'est facturé nulle part,
   * et figure dans les « Bons à constater ». Le bloqueur reste un filet,
   * éprouvé par `issue-monthly-invoices.handler.spec.ts`.
   */
  it("un bon jamais retiré n'est dans aucune facture, ne bloque personne, et attend d'être constaté", async () => {
    const id = await entity();
    const complete = await payer(id);
    const waiting = await payer(id, { handedOver: false });

    const report = await issueByHand(id);

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual([complete.id]);
    expect(report.blocked).toEqual([]);
    expect((await view(id)).signaled).toEqual([]);
    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: waiting.id } })).toBe(0);
    const counter = await ctx.prisma.invoiceNumberCounter.findMany({ select: { lastRank: true } });
    expect(counter).toEqual([{ lastRank: 1 }]);
  });

  it("le bouton le 2 du mois suivant : datée du 2, jamais antidatée, numéro dans l'ordre", async () => {
    const id = await entity();
    const first = await payer(id);
    await issueByHand(id);
    const second = await payer(id);
    // Les bons du second payeur sont du mois facturé ; on émet le 2, à 10h environ.
    const late = new Date(closesAt.getTime() + DAY_MS + 10 * HOUR_MS);
    clock.set(late);

    const report = await issueByHand(id);

    const lateDay = instantToLocal(late).day;
    expect(report.issued).toEqual([
      {
        payerCompanyId: second.id,
        number: expect.stringMatching(NUMBER) as string,
        issuedOn: lateDay,
      },
    ]);
    const invoices = await ctx.prisma.invoice.findMany({ orderBy: { rank: "asc" } });
    expect(
      invoices.map((i) => [i.payerCompanyId, i.rank, i.issuedOn.toISOString().slice(0, 10)]),
    ).toEqual([
      [first.id, 1, lastDayOf(closesAt)],
      [second.id, 2, lateDay],
    ]);
    expect((await view(id)).invoices.map((i) => i.issuedOn)).toContain(lateDay);
  });

  it("avant le dernier jour 23h55 : 409, aucune facture", async () => {
    const id = await entity();
    await payer(id);
    clock.set(new Date(issuableFrom.getTime() - HOUR_MS));

    const response = await staff()
      .post(MONTHLY)
      .send({ legalEntityId: id, periodClosesAt: closesAt.toISOString() })
      .expect(409);

    expect(response.text).toContain("23:55");
    expect(await ctx.prisma.invoice.count()).toBe(0);
  });

  it("un lot annulé rend sa facture à prélever : le suivant la reprend", async () => {
    const id = await entity();
    await payer(id);
    await issueByHand(id);
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: id }).expect(201);
    const first = await ctx.prisma.collectionBatch.findFirstOrThrow();

    await staff().post(`${COLLECTION}/batches/${first.id}/cancel`).expect(204);
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: id }).expect(201);

    const links = await ctx.prisma.collectionBatchLineInvoice.findMany();
    expect(links.map((link) => link.batchId)).toEqual(
      expect.arrayContaining([first.id, expect.not.stringMatching(first.id) as string]),
    );
    expect(new Set(links.map((link) => link.invoiceId)).size).toBe(1);
  });
  it("deux mandats chez un payeur : deux factures, deux lignes, chacune avec SES numéros (E4b)", async () => {
    const id = await entity();
    const principal = await payer(id);
    const site = await siteOnOwnMandate(id, principal.id);

    await invoicePass();

    const invoices = await ctx.prisma.invoice.findMany({ orderBy: { rank: "asc" } });
    expect(invoices.map((i) => [i.payerCompanyId, i.paymentMeans])).toEqual([
      [principal.id, { code: "59", mandateReference: "RUM-E4-1" }],
      [principal.id, { code: "59", mandateReference: site.reference }],
    ]);
    expect(await ctx.prisma.invoiceMonthlyOutcome.count({ where: { outcome: "issued" } })).toBe(2);

    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await pass();

    const lines = await ctx.prisma.collectionBatchLine.findMany({ include: { invoices: true } });
    expect(lines).toHaveLength(2);
    expect(lines.flatMap((line) => line.invoices.map((link) => link.invoiceId)).sort()).toEqual(
      invoices.map((invoice) => invoice.id).sort(),
    );
    for (const line of lines) {
      const invoice = invoices.find((candidate) => candidate.id === line.invoices[0]?.invoiceId);
      expect(line.invoices).toHaveLength(1);
      expect(line.amountCents).toBe(invoice?.totalTtcCents);
    }
    const notices = await ctx.prisma.collectionNotice.findMany();
    expect(notices.map((notice) => notice.invoiceNumbers.join()).sort()).toEqual(
      invoices.map((invoice) => invoice.number).sort(),
    );
    expect(
      await ctx.prisma.orderCollection.count({ where: { exclusionReason: "invoice_split" } }),
    ).toBe(0);
  });

  it("rejouer le bouton après deux factures par mandat ne double rien", async () => {
    const id = await entity();
    const principal = await payer(id);
    await siteOnOwnMandate(id, principal.id);
    await issueByHand(id);

    const replay = await issueByHand(id);

    expect(replay).toMatchObject({ issued: [], blocked: [], alreadyInvoiced: 2 });
    expect(await ctx.prisma.invoice.count()).toBe(2);
  });
});

describe("la facture par clôture d'un rythme hebdomadaire (R3, rétabli en M2)", () => {
  it("un payeur passé à l'hebdomadaire : sa semaine se facture la veille de sa clôture, sur [clôture du mois, lundi[", async () => {
    const id = await entity();
    const company = await payer(id);
    const startsAt = month.cycle().startsAt;
    const closingDay = instantToLocal(closesAt).day;
    const isoWeekday = weekdayOf(closingDay) === 0 ? 7 : weekdayOf(closingDay);
    // Huit jours avant le mois : les dates de l'hebdomadaire passent au jour de
    // semaine de la clôture du mois, à la prochaine clôture hebdomadaire —
    // avant le mois. La première semaine du payeur durera donc sept jours.
    clock.set(new Date(startsAt.getTime() - 8 * DAY_MS + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/billing-modes/weekly`)
      .send({ days: [isoWeekday] })
      .expect(204);
    // Pendant le mois : le payeur passe à l'hebdomadaire à la clôture du mois.
    clock.set(new Date(startsAt.getTime() + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${company.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    const week = nextClosureAfter(closesAt, BillingRhythm.weekly(isoWeekday));
    await laterOrder(company.id, new Date(closesAt.getTime() + 2 * DAY_MS));
    // La veille de la clôture hebdomadaire, 23h57 à Paris.
    clock.set(new Date(invoicingMomentOf(week).getTime() + 2 * 60 * 1000));

    const evening = await invoicePass();

    // Le rattrapage tente la clôture du mois (manquée), puis la semaine, dans l'ordre.
    expect(evening.runs).toEqual([
      { legalEntityId: id, periodClosesAt: closesAt.toISOString(), outcome: "issued" },
      { legalEntityId: id, periodClosesAt: week.toISOString(), outcome: "issued" },
    ]);
    const invoices = await ctx.prisma.invoice.findMany({ orderBy: { rank: "asc" } });
    // Jamais d'antidate : la facture du mois, rattrapée le soir de la semaine,
    // porte le jour réel de son émission — la période facturée reste le mois.
    expect(invoices.map((i) => i.issuedOn.toISOString().slice(0, 10))).toEqual([
      lastDayOf(week),
      lastDayOf(week),
    ]);
    const screen = await view(id);
    expect(screen).toMatchObject({
      periodClosesAt: week.toISOString(),
      periodStartsAt: closesAt.toISOString(),
    });
    expect(screen.invoices.map((i) => i.number)).toEqual([invoices[1]?.number]);
  });
});

describe("le relevé, la période rangée et l'e-mail d'un payeur hebdomadaire (M4a)", () => {
  it("ses semaines au sélecteur, sa période rangée sur l'issue et relue, l'e-mail qui la dit", async () => {
    const id = await entity();
    const company = await payer(id);
    const monthlyPayer = await payer(id);
    const startsAt = month.cycle().startsAt;
    const closingDay = instantToLocal(closesAt).day;
    const isoWeekday = weekdayOf(closingDay) === 0 ? 7 : weekdayOf(closingDay);
    // Même mise en place que le R3 rétabli en M2 : le payeur devient
    // hebdomadaire à la clôture du mois.
    clock.set(new Date(startsAt.getTime() - 8 * DAY_MS + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/billing-modes/weekly`)
      .send({ days: [isoWeekday] })
      .expect(204);
    clock.set(new Date(startsAt.getTime() + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${company.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    const week = nextClosureAfter(closesAt, BillingRhythm.weekly(isoWeekday));
    await laterOrder(company.id, new Date(closesAt.getTime() + 2 * DAY_MS));
    clock.set(new Date(invoicingMomentOf(week).getTime() + 2 * 60 * 1000));
    await invoicePass();

    // La période rangée : le mois pour la facture rattrapée, la semaine ensuite.
    const outcomes = await ctx.prisma.invoiceMonthlyOutcome.findMany({
      where: { payerCompanyId: company.id, outcome: "issued" },
      orderBy: { periodClosesAt: "asc" },
    });
    expect(outcomes.map((o) => [o.periodStartsAt, o.periodClosesAt])).toEqual([
      [startsAt, closesAt],
      [closesAt, week],
    ]);
    // Relue par la fiche du payeur : la semaine, pas le mois où elle s'achève.
    const weekLabel = periodLabelOf({ startsAt: closesAt, closesAt: week });
    const listed = jsonBody<IssuedInvoicesView>(
      await staff().get(`/admin/companies/${company.id}/invoices`).expect(200),
    );
    expect(listed.invoices.map((i) => i.periodLabel)).toEqual([
      weekLabel,
      periodLabelOf({ startsAt, closesAt }),
    ]);
    // L'e-mail de la facture de la semaine dit la semaine.
    expect(sentData).toContainEqual(expect.objectContaining({ period: weekLabel }));

    // Le sélecteur du relevé : SES semaines ; un payeur resté mensuel, ses mois.
    const cycles = jsonBody<StatementCyclesView>(
      await staff().get(`/admin/accounting/statements/cycles?companyId=${company.id}`).expect(200),
    );
    expect(cycles.cycles.slice(0, 2).map((c) => [c.periodStartsAt, c.periodClosesAt])).toEqual([
      [closesAt.toISOString(), week.toISOString()],
      [startsAt.toISOString(), closesAt.toISOString()],
    ]);
    const monthlyCycles = jsonBody<StatementCyclesView>(
      await staff()
        .get(`/admin/accounting/statements/cycles?companyId=${monthlyPayer.id}`)
        .expect(200),
    );
    expect(monthlyCycles.cycles[0]?.periodStartsAt).toBe(closesAt.toISOString());
    expect(monthlyCycles.cycles[0]?.periodClosesAt).not.toBe(week.toISOString());
    // Le relevé de la semaine se lit ; chez le mensuel, ce lundi ne clôt rien.
    await staff()
      .get(
        `/admin/accounting/statements/companies/${company.id}?periodClosesAt=${week.toISOString()}`,
      )
      .expect(200);
    await staff()
      .get(
        `/admin/accounting/statements/companies/${monthlyPayer.id}?periodClosesAt=${week.toISOString()}`,
      )
      .expect(400);
  });
});

describe("le lot par clôture d'un rythme hebdomadaire (R4, rétabli en M3)", () => {
  it("le mois, puis la semaine : chaque facture est prélevée par le lot de SA clôture", async () => {
    const id = await entity();
    const company = await payer(id);
    const startsAt = month.cycle().startsAt;
    const closingDay = instantToLocal(closesAt).day;
    const isoWeekday = weekdayOf(closingDay) === 0 ? 7 : weekdayOf(closingDay);
    // Les dates de l'hebdomadaire, avant le mois ; le payeur y passe pendant
    // le mois, à la clôture du mois (comme le R3 rétabli en M2).
    clock.set(new Date(startsAt.getTime() - 8 * DAY_MS + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/billing-modes/weekly`)
      .send({ days: [isoWeekday] })
      .expect(204);
    clock.set(new Date(startsAt.getTime() + HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${company.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    const week = nextClosureAfter(closesAt, BillingRhythm.weekly(isoWeekday));

    // La facture du mois, puis son lot, deux heures après la clôture du mois.
    clock.set(new Date(issuableFrom.getTime() + 2 * 60 * 1000));
    await invoicePass();
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["constituted"]);

    // Un bon de la première semaine ; sa facture la veille de la clôture
    // hebdomadaire, son lot deux heures après — l'automatisme suit le calendrier.
    await laterOrder(company.id, new Date(closesAt.getTime() + 2 * DAY_MS));
    clock.set(new Date(invoicingMomentOf(week).getTime() + 2 * 60 * 1000));
    await invoicePass();
    clock.set(new Date(week.getTime() + 2 * HOUR_MS));
    const weekly = await pass();

    expect(weekly.runs.map((run) => run.outcome)).toEqual(["constituted"]);
    const batches = await ctx.prisma.collectionBatch.findMany({
      orderBy: { cycleClosesAt: "asc" },
      include: { lines: { include: { invoices: true } } },
    });
    expect(batches.map((batch) => [batch.cycleStartsAt, batch.cycleClosesAt])).toEqual([
      [startsAt, closesAt],
      [closesAt, week],
    ]);
    const invoices = await ctx.prisma.invoice.findMany({ orderBy: { rank: "asc" } });
    expect(
      batches.map((batch) => batch.lines.flatMap((l) => l.invoices.map((i) => i.invoiceId))),
    ).toEqual([[invoices[0]?.id], [invoices[1]?.id]]);
    expect(batches[1]?.lines[0]?.amountCents).toBe(invoices[1]?.totalTtcCents);
    // Rejouer le passage ne tente pas une seconde fois la semaine.
    expect((await pass()).runs).toEqual([]);
  });
});

describe("rythmes mêlés : chaque payeur facturé à SA clôture (M2), prélevé au lot de SA clôture (M3)", () => {
  it("au lundi le seul hebdomadaire, au 1er le mensuel ; aucun bon facturé ni aucune facture prélevée deux fois", async () => {
    const id = await entity();
    const monthly = await payer(id);
    const weekly = await payer(id);
    const startsAt = month.cycle().startsAt;
    // Avant le mois : le second payeur est hebdomadaire (lundi) dès son ouverture.
    clock.set(new Date(startsAt.getTime() - HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${weekly.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    // Un bon de la première semaine du mois ; l'autre (de `payer`) deux jours avant la clôture.
    await laterOrder(weekly.id, new Date(startsAt.getTime() + HOUR_MS));
    const firstMonday = nextClosureAfter(startsAt, BillingRhythm.weekly(1));
    const lastWeek = nextClosureAfter(
      new Date(closesAt.getTime() - 2 * DAY_MS),
      BillingRhythm.weekly(1),
    );

    // Le dimanche soir de la première semaine : le seul hebdomadaire.
    clock.set(new Date(invoicingMomentOf(firstMonday).getTime() + 2 * 60 * 1000));
    expect(await invoicePass()).toEqual({
      runs: [{ legalEntityId: id, periodClosesAt: firstMonday.toISOString(), outcome: "issued" }],
    });
    expect(await payersInvoiced()).toEqual([weekly.id]);
    // Le lundi, deux heures après : le lot ne prélève que la facture émise (M3).
    clock.set(new Date(firstMonday.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["constituted"]);
    expect(await invoicesCollectedAt(firstMonday)).toEqual(await invoiceIdsOf([weekly.id]));

    // Chaque clôture du calendrier ensuite : la facture la veille, le lot le
    // jour — aucune n'est manquée, un lundi sans facture compris (M3).
    const last = lastWeek.getTime() > closesAt.getTime() ? lastWeek : closesAt;
    for (const closure of closuresBetween(firstMonday, last)) {
      clock.set(new Date(invoicingMomentOf(closure).getTime() + 2 * 60 * 1000));
      await invoicePass();
      clock.set(new Date(closure.getTime() + 2 * HOUR_MS));
      const [run] = (await pass()).runs;
      expect(["constituted", "nothing_to_collect"]).toContain(run?.outcome);
    }
    const monthlyOutcome = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow({
      where: { payerCompanyId: monthly.id },
    });
    expect(monthlyOutcome.periodClosesAt).toEqual(closesAt);
    // Le lot du 1er prélève la facture du mensuel.
    expect(await invoicesCollectedAt(closesAt)).toEqual(
      expect.arrayContaining(await invoiceIdsOf([monthly.id])),
    );

    // Chaque facture prélevée par exactement UN lot.
    const collected = await ctx.prisma.collectionBatchLineInvoice.findMany({
      select: { invoiceId: true },
    });
    const allInvoices = await ctx.prisma.invoice.findMany({ select: { id: true } });
    expect(collected.map((link) => link.invoiceId).sort()).toEqual(
      allInvoices.map((invoice) => invoice.id).sort(),
    );

    const links = await ctx.prisma.invoiceOrder.findMany({ select: { orderId: true } });
    const orders = await ctx.prisma.order.findMany({ select: { id: true } });
    expect(links.map((link) => link.orderId).sort()).toEqual(orders.map((o) => o.id).sort());
    expect([...(await payersInvoiced())].sort()).toEqual([monthly.id, weekly.id].sort());
    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: monthly.id } })).toBe(1);
  });
});

describe("l'écran par clôture, rythmes mêlés (M4c)", () => {
  it("la vue rend le 1er et le premier lundi qui suit, chacun avec ses payeurs et son lot", async () => {
    const id = await entity();
    const monthly = await payer(id);
    const weekly = await payer(id);
    // Avant la clôture du 1er : le second payeur passe à l'hebdomadaire, en
    // vigueur à cette clôture (la prochaine de son mode actuel, le mensuel).
    clock.set(new Date(closesAt.getTime() - 3 * DAY_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${weekly.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    const firstMonday = nextClosureAfter(closesAt, BillingRhythm.weekly(1));

    // Le 1er : les deux payeurs closent leur mois (le second l'a fini en mensuel).
    clock.set(new Date(issuableFrom.getTime() + 2 * 60 * 1000));
    await invoicePass();
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["constituted"]);
    // Un bon de la première semaine, chez l'hebdomadaire seul.
    await laterOrder(weekly.id, new Date(closesAt.getTime() + 3 * HOUR_MS));

    // Le premier lundi : sa facture la veille, son lot le jour.
    clock.set(new Date(invoicingMomentOf(firstMonday).getTime() + 2 * 60 * 1000));
    await invoicePass();
    clock.set(new Date(firstMonday.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["constituted"]);

    const read = await view(id);
    const first = read.closures.find(
      (closure) => closure.periodClosesAt === closesAt.toISOString(),
    );
    const monday = read.closures.find(
      (closure) => closure.periodClosesAt === firstMonday.toISOString(),
    );
    expect(first?.modes).toEqual(["monthly"]);
    expect(first?.invoices.map((invoice) => invoice.payerCompanyId).sort()).toEqual(
      [monthly.id, weekly.id].sort(),
    );
    expect(first?.batches.map((batch) => batch.status)).toEqual(["constituted"]);
    expect(monday?.modes).toEqual(["weekly"]);
    expect(monday?.invoices.map((invoice) => invoice.payerCompanyId)).toEqual([weekly.id]);
    expect(monday?.batches.map((batch) => batch.periodLabel)).toEqual([
      periodLabelOf({ startsAt: closesAt, closesAt: firstMonday }),
    ]);
    // Dans l'ordre, et la fiche nomme le lot du lundi par sa période.
    const order = read.closures.map((closure) => closure.periodClosesAt);
    expect(order).toEqual([...order].sort());
    const fiche = jsonBody<{ lastClosurePeriod: unknown }>(
      await staff().get(`${ENTITIES}/${id}`).expect(200),
    );
    expect(fiche.lastClosurePeriod).toEqual({
      closesAt: firstMonday.toISOString(),
      startsAt: closesAt.toISOString(),
      label: periodLabelOf({ startsAt: closesAt, closesAt: firstMonday }),
    });
    // Les modes d'un lot sont ceux des clients qu'il PRÉLÈVE (Hugo, 2026-10-12) :
    // au 1er les deux payeurs, chacun en mensuel ; au lundi l'hebdomadaire seul.
    const cycle = jsonBody<CollectionCycleView>(
      await staff().get(`${COLLECTION}/cycle?legalEntityId=${id}`).expect(200),
    );
    const modesAt = (at: Date) =>
      cycle.batches
        .filter((batch) => batch.cycleClosesAt === at.toISOString())
        .map((batch) => batch.payerModes);
    expect(modesAt(closesAt)).toEqual([["monthly"]]);
    expect(modesAt(firstMonday)).toEqual([["weekly"]]);
  });
});

/** Les clôtures du calendrier (lundis de l'hebdomadaire ∪ 1ers du mensuel) dans `]after, until]`. */
function closuresBetween(after: Date, until: Date): readonly Date[] {
  const closures: Date[] = [];
  let cursor = after;
  while (cursor.getTime() < until.getTime()) {
    const monday = nextClosureAfter(cursor, BillingRhythm.weekly(1));
    const first = nextClosureAfter(cursor, BillingRhythm.default());
    cursor = monday.getTime() < first.getTime() ? monday : first;
    closures.push(cursor);
  }
  return closures;
}

/** Les factures prélevées par le lot clos à `closesAt`, triées. */
async function invoicesCollectedAt(closesAt: Date): Promise<readonly string[]> {
  const links = await ctx.prisma.collectionBatchLineInvoice.findMany({
    where: { line: { batch: { cycleClosesAt: closesAt } } },
    select: { invoiceId: true },
  });
  return links.map((link) => link.invoiceId).sort();
}

/** Les factures de ces payeurs, triées. */
async function invoiceIdsOf(payers: readonly string[]): Promise<readonly string[]> {
  const invoices = await ctx.prisma.invoice.findMany({
    where: { payerCompanyId: { in: [...payers] } },
    select: { id: true },
  });
  return invoices.map((invoice) => invoice.id).sort();
}

/** Les payeurs facturés, dans l'ordre d'émission, chacun une fois. */
async function payersInvoiced(): Promise<readonly string[]> {
  const invoices = await ctx.prisma.invoice.findMany({
    orderBy: { rank: "asc" },
    select: { payerCompanyId: true },
  });
  return [...new Set(invoices.map((invoice) => invoice.payerCompanyId))];
}

/** Un bon de plus au compte de ce payeur, passé à `createdAt`. */
async function laterOrder(companyId: string, createdAt: Date): Promise<void> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `r3-later-${String(seq)}` });
  const placedOrder = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-R3-${String(seq)}`,
      companyId,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      paymentStatus: "not_required",
      createdAt,
      lines: {
        create: {
          sku: "PAIN-R3",
          productNameSnapshot: "Pain de la semaine",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true, orderNumber: true, createdAt: true },
  });
  await handOver(ctx.prisma, placedOrder);
}

/**
 * Un site qui suit la facturation du principal, prélevé sur SON mandat
 * (forme 2) au nom du principal, avec un bon du mois au compte de celui-ci.
 */
async function siteOnOwnMandate(
  entityId: string,
  principalId: string,
): Promise<{ readonly id: string; readonly reference: string }> {
  seq += 1;
  const site = await createCompany(ctx.prisma, {
    raisonSociale: "",
    enseigne: `Chalet ${String(seq)}`,
  });
  await ctx.prisma.company.update({
    where: { id: site.id },
    data: { parentCompanyId: principalId },
  });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: site.id,
      parentId: principalId,
      aspect: "billing",
      validFrom: new Date(closesAt.getTime() - 30 * DAY_MS),
    },
  });
  const account = await ctx.prisma.companyBankAccount.findUniqueOrThrow({
    where: { companyId: principalId },
    select: { id: true },
  });
  const reference = `RUM-E4-SITE-${String(seq)}`;
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: site.id,
      creditorId: entityId,
      reference,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
      bankAccountId: account.id,
      debtorCompanyId: principalId,
      debtorSiren: "552100554",
      debtorName: "Boulangerie principale",
      debtorLegalForm: "SAS",
    },
  });
  await ctx.prisma.companyCollectionForm.create({
    data: {
      companyId: site.id,
      form: "own_mandate_principal_iban",
      validFrom: new Date(closesAt.getTime() - 10 * DAY_MS),
    },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: `e4b-site-${String(seq)}` });
  const placedOrder = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-E4-${String(seq)}`,
      companyId: site.id,
      billedCompanyId: principalId,
      placedByUserId: user.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - DAY_MS),
      lines: {
        create: {
          sku: "PAIN-E4",
          productNameSnapshot: "Pain du site",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
    select: { id: true, orderNumber: true, createdAt: true },
  });
  await handOver(ctx.prisma, placedOrder);
  return { id: site.id, reference };
}

describe("facturer chaque bon dans le mois de sa livraison (lot ZL)", () => {
  /** La clôture du mois qui SUIT le mois facturé — le mois du jour du test. */
  function nextMonthClosure(): Date {
    return nextClosureAfter(closesAt, BillingRhythm.default());
  }

  /** L'unique bon (jamais remis) du payeur. */
  function orderOf(companyId: string) {
    return ctx.prisma.order.findFirstOrThrow({
      where: { companyId },
      select: { id: true, orderNumber: true },
    });
  }

  async function receivedOnOfLine(orderId: string): Promise<string | null> {
    const line = await ctx.prisma.invoiceOrder.findFirstOrThrow({ where: { orderId } });
    return line.receivedOn?.toISOString().slice(0, 10) ?? null;
  }

  it("commandé le 30, livré le 5 : facturé avec le mois de SA livraison, pas celui de sa commande", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const order = await orderOf(company.id);

    // Le dernier soir du mois commandé : rien à facturer, rien de bloqué.
    const first = await issueByHand(id);
    expect(first.issued).toEqual([]);
    expect(first.blocked).toEqual([]);

    // Livré le 5 du mois suivant (Paris), facturé à SA clôture.
    const fifth = new Date(closesAt.getTime() + 4 * DAY_MS + 8 * HOUR_MS);
    await markDelivered(ctx.prisma, order.id, fifth);
    const next = nextMonthClosure();
    clock.set(new Date(invoicingMomentOf(next).getTime() + 2 * 60 * 1000));
    const second = await issueByHand(id, next);

    expect(second.issued.map((issue) => issue.payerCompanyId)).toEqual([company.id]);
    expect(second.issued[0]?.issuedOn).toBe(lastDayOf(next));
    expect(await receivedOnOfLine(order.id)).toBe(instantToLocal(fifth).day);
  });

  it("livré le 31, constaté le 1er après l'émission : dans la facture suivante, « livré le 31 », facturé et prélevé une fois", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const order = await orderOf(company.id);
    expect((await issueByHand(id)).issued).toEqual([]);
    // Le lot du 1er : le bon n'est pas livré, il n'est pas prélevé.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["nothing_to_collect"]);

    // Constaté le 1er au matin : livré la veille au soir, le 31 (Paris).
    clock.set(new Date(closesAt.getTime() + 8 * HOUR_MS));
    const lastEvening = new Date(closesAt.getTime() - 4 * HOUR_MS);
    await markDelivered(ctx.prisma, order.id, lastEvening);
    const next = nextMonthClosure();
    clock.set(new Date(invoicingMomentOf(next).getTime() + 2 * 60 * 1000));
    const report = await issueByHand(id, next);

    expect(report.issued.map((issue) => issue.payerCompanyId)).toEqual([company.id]);
    expect(await receivedOnOfLine(order.id)).toBe(lastDayOf(closesAt));
    // Rejoué : jamais deux fois.
    expect((await issueByHand(id, next)).issued).toEqual([]);
    expect(await ctx.prisma.invoiceOrder.count({ where: { orderId: order.id } })).toBe(1);

    // Le lot de la clôture suivante prélève CETTE facture, une fois ; le
    // passage d'après ne la reprend pas.
    clock.set(new Date(next.getTime() + 2 * HOUR_MS));
    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["constituted"]);
    expect(await invoicesCollectedAt(next)).toEqual(await invoiceIdsOf([company.id]));
    clock.set(new Date(next.getTime() + 3 * HOUR_MS));
    await pass();
    expect(await ctx.prisma.collectionBatchLineInvoice.count()).toBe(1);
  });

  /** Les ids des bons du relevé de `companyId` à la clôture `at`. */
  async function statementOrderIds(companyId: string, at: Date): Promise<readonly string[]> {
    const view = jsonBody<CycleStatementView>(
      await staff()
        .get(
          `/admin/accounting/statements/companies/${companyId}?periodClosesAt=${at.toISOString()}`,
        )
        .expect(200),
    );
    return view.groups.flatMap((group) => group.orders.map((order) => order.id));
  }

  /** Les numéros des bons du dossier de `companyId` à la clôture `at`. */
  async function dossierReferences(companyId: string, at: Date): Promise<readonly string[]> {
    const view = jsonBody<InvoiceDossierView>(
      await staff()
        .get(
          `/admin/accounting/invoice-dossiers/companies/${companyId}?periodClosesAt=${at.toISOString()}`,
        )
        .expect(200),
    );
    return view.orders.map((order) => order.reference);
  }

  /**
   * « Le relevé suit la facture » (Hugo, 2026-10-22) : avant, le relevé et le
   * dossier bornaient par jour de livraison, et le bon du 31 constaté après
   * l'émission d'octobre apparaissait au relevé d'OCTOBRE alors qu'il part
   * dans la facture de NOVEMBRE.
   */
  it("le bon du 31 constaté le 1er : absent du relevé d'octobre, au relevé et au dossier de novembre, facturé une fois", async () => {
    const id = await entity();
    const late = await payer(id, { handedOver: false });
    const onTime = await payer(id);
    const lateOrder = await orderOf(late.id);
    expect((await issueByHand(id)).issued.map((issue) => issue.payerCompanyId)).toEqual([
      onTime.id,
    ]);

    clock.set(new Date(closesAt.getTime() + 8 * HOUR_MS));
    await markDelivered(ctx.prisma, lateOrder.id, new Date(closesAt.getTime() - 4 * HOUR_MS));
    const next = nextMonthClosure();

    // Le cycle facturé montre exactement SA facture.
    const invoiced = await ctx.prisma.invoiceOrder.findMany({
      where: { invoice: { payerCompanyId: onTime.id } },
      select: { orderId: true },
    });
    expect(await statementOrderIds(onTime.id, closesAt)).toEqual(invoiced.map((r) => r.orderId));
    // Le retardataire : ni au relevé ni au dossier d'octobre, mais à ceux de novembre.
    expect(await statementOrderIds(late.id, closesAt)).toEqual([]);
    expect(await dossierReferences(late.id, closesAt)).toEqual([]);
    expect(await statementOrderIds(late.id, next)).toEqual([lateOrder.id]);
    expect(await dossierReferences(late.id, next)).toEqual([lateOrder.orderNumber]);

    // Novembre émis : il y reste, une fois, et toujours pas en octobre.
    clock.set(new Date(invoicingMomentOf(next).getTime() + 2 * 60 * 1000));
    expect((await issueByHand(id, next)).issued.map((issue) => issue.payerCompanyId)).toEqual([
      late.id,
    ]);
    expect(await statementOrderIds(late.id, next)).toEqual([lateOrder.id]);
    expect(await statementOrderIds(late.id, closesAt)).toEqual([]);
    expect(await ctx.prisma.invoiceOrder.count({ where: { orderId: lateOrder.id } })).toBe(1);

    // Le lot d'octobre constitué en retard ne prend pas la facture de novembre.
    await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: id }).expect(201);
    expect(await invoicesCollectedAt(closesAt)).toEqual(await invoiceIdsOf([onTime.id]));
  });

  it("une semaine à cheval sur deux mois : deux factures, une par mois civil (Q-L1)", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const startsAt = month.cycle().startsAt;
    clock.set(new Date(startsAt.getTime() - HOUR_MS));
    await staff()
      .put(`${ENTITIES}/${id}/payers/${company.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);
    const order = await orderOf(company.id);
    // Livré le dernier jour du mois, et un second bon le 1er du suivant.
    await markDelivered(ctx.prisma, order.id, new Date(closesAt.getTime() - 4 * HOUR_MS));
    await laterOrder(company.id, new Date(closesAt.getTime() + 2 * HOUR_MS));

    // Le dernier soir du mois : sa semaine est coupée au 1er.
    clock.set(new Date(issuableFrom.getTime() + 2 * 60 * 1000));
    await invoicePass();
    // Puis la veille du lundi qui suit (ou du 1er suivant).
    const after = nextClosureAfter(closesAt, BillingRhythm.weekly(1));
    clock.set(new Date(invoicingMomentOf(after).getTime() + 2 * 60 * 1000));
    await invoicePass();

    const invoices = await ctx.prisma.invoice.findMany({
      where: { payerCompanyId: company.id },
      orderBy: { rank: "asc" },
      include: { orders: { select: { receivedOn: true } } },
    });
    expect(invoices.map((invoice) => invoice.issuedOn.toISOString().slice(0, 7))).toEqual([
      lastDayOf(closesAt).slice(0, 7),
      lastDayOf(after).slice(0, 7),
    ]);
    expect(
      invoices.map((invoice) =>
        invoice.orders.map((line) => line.receivedOn?.toISOString().slice(0, 10)),
      ),
    ).toEqual([[lastDayOf(closesAt)], [instantToLocal(closesAt).day]]);
  });

  it("les bons à constater : jour passé, sans remise, au compte ; ils en sortent une fois constatés", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const order = await orderOf(company.id);
    const served = new Date(closesAt.getTime() - 2 * DAY_MS);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { requestedDeliveryDate: new Date(`${instantToLocal(served).day}T00:00:00.000Z`) },
    });

    const waiting = jsonBody<UnconfirmedDeliveriesView>(
      await staff().get("/admin/accounting/unconfirmed-deliveries").expect(200),
    );
    expect(waiting.before).toBe(lastDayOf(closesAt));
    expect(waiting.orders).toEqual([
      expect.objectContaining({
        orderNumber: order.orderNumber,
        companyId: company.id,
        serviceDay: instantToLocal(served).day,
        totalCents: 10_550,
      }),
    ]);

    await markDelivered(ctx.prisma, order.id, served);
    const after = jsonBody<UnconfirmedDeliveriesView>(
      await staff().get("/admin/accounting/unconfirmed-deliveries").expect(200),
    );
    expect(after.orders).toEqual([]);
  });

  it("le jour de livraison posé ne bouge plus : la base le refuse", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const order = await orderOf(company.id);
    await markDelivered(ctx.prisma, order.id, new Date(closesAt.getTime() - DAY_MS));

    await expect(
      markDelivered(ctx.prisma, order.id, new Date(closesAt.getTime() + DAY_MS)),
    ).rejects.toThrow(/ne change plus/u);
  });
});

/**
 * L'onglet « Factures » de la procédure de prélèvement (2026-10-24, refondu
 * le même jour, plan § 12.4) : UNE liste des commandes de la période, UN
 * statut par commande, lus à travers la vraie base — la facture l'emporte
 * toujours, même sans jour de livraison.
 */
describe("l'onglet Factures de la procédure : une commande, un statut", () => {
  async function procedureAt(entityId: string): Promise<CollectionProcedureView> {
    const procedureId = `${entityId}~${instantToLocal(closesAt).day}`;
    return jsonBody<CollectionProcedureView>(
      await staff()
        .get(
          `/admin/accounting/collection-procedure?procedureId=${encodeURIComponent(procedureId)}`,
        )
        .expect(200),
    );
  }

  function firstOrderOf(companyId: string) {
    return ctx.prisma.order.findFirstOrThrow({
      where: { companyId },
      select: { id: true, orderNumber: true },
    });
  }

  /** Le jour demandé de la commande : `at`, lu à Paris. */
  async function servedOn(orderId: string, at: Date): Promise<void> {
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { requestedDeliveryDate: new Date(`${instantToLocal(at).day}T00:00:00.000Z`) },
    });
  }

  it("une réception confirmée : à facturer, comptée au bouton ; une fois émise : facturée, avec son numéro", async () => {
    const id = await entity();
    const company = await payer(id);
    const order = await firstOrderOf(company.id);

    const before = await procedureAt(id);
    expect(before.invoices).toMatchObject({
      state: "to_do",
      reason: "receipts_to_invoice",
      figures: { invoiced: 0, receiptConfirmed: 1, receiptToConfirm: 0 },
      issuableCount: 1,
    });
    expect(before.invoices.orders).toEqual([
      expect.objectContaining({
        orderNumber: order.orderNumber,
        status: "receipt_confirmed",
        invoiceNumber: null,
      }),
    ]);

    await issueByHand(id);

    const after = await procedureAt(id);
    expect(after.invoices).toMatchObject({
      state: "done",
      reason: "all_invoiced",
      figures: {
        invoiced: before.invoices.issuableCount,
        receiptConfirmed: 0,
        receiptToConfirm: 0,
      },
      issuableCount: 0,
    });
    expect(after.invoices.orders[0]?.invoiceNumber).toMatch(NUMBER);
  });

  it("jamais remise, jour passé dans la période : à confirmer ; une commande d'avant la période n'y est pas", async () => {
    const id = await entity();
    const company = await payer(id, { handedOver: false });
    const order = await firstOrderOf(company.id);
    await servedOn(order.id, new Date(closesAt.getTime() - 2 * DAY_MS));
    const older = await payer(id, { handedOver: false });
    await servedOn(
      (await firstOrderOf(older.id)).id,
      new Date(month.cycle().startsAt.getTime() - 2 * DAY_MS),
    );

    const view = await procedureAt(id);

    expect(view.invoices.reason).toBe("receipts_to_confirm");
    expect(view.invoices.orders.map((row) => [row.orderNumber, row.status])).toEqual([
      [order.orderNumber, "receipt_to_confirm"],
    ]);
  });

  /** Régression (dev, 2026-10-24) : remise et facturée avant la règle ZL, sans `received_on`, elle était « à constater ». */
  it("facturée sans jour de livraison : facturée, jamais à confirmer", async () => {
    const id = await entity();
    await payer(id);
    await issueByHand(id);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { legalEntityId: id, type: "380" },
      select: { id: true, number: true },
    });
    const legacy = await payer(id, { handedOver: false });
    const order = await firstOrderOf(legacy.id);
    await servedOn(order.id, new Date(closesAt.getTime() - 3 * DAY_MS));
    await ctx.prisma.invoiceOrder.create({
      data: {
        invoiceId: invoice.id,
        invoiceType: "380",
        orderId: order.id,
        orderNumber: order.orderNumber,
        receivedOn: null,
        position: 1,
      },
    });

    const view = await procedureAt(id);

    expect(view.invoices.orders.find((row) => row.orderNumber === order.orderNumber)).toMatchObject(
      { status: "invoiced", invoiceNumber: invoice.number },
    );
    expect(view.invoices).toMatchObject({ state: "done", reason: "all_invoiced" });
  });
});
