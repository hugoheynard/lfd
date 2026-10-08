/**
 * E2E de **la facture du mois, et du lot qui encaisse des factures** (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, lots E4, E4b).
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
 * `collection-autopilot.e2e-spec.ts`. Aucune date absolue : le mois est le
 * PRÉCÉDENT du jour du test, ses instants sortent du domaine, et l'horloge
 * FIXE est posée relativement à eux.
 */
import {
  instantToLocal,
  type MonthlyInvoiceReportView,
  type MonthlyInvoicesView,
} from "@lfd/contracts";

import {
  invoicingMomentOf,
  lastDayOf,
} from "../src/b2b/accounting/domain/services/monthly-invoicing.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
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
const NUMBER = /^FA-\d{4}-\d{6}$/u;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** `<gabarit> → <destinataire>` : depuis E6, la facture prévient aussi. */
const sentMails: string[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: {
    readonly to: string;
    readonly template: string;
  }): Promise<{ providerId: null }> => {
    sentMails.push(`${args.template} → ${args.to}`);
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
  // La base est purgée : les RUM et les comptes repartent de 1 à chaque test.
  seq = 0;
  month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  issuableFrom = invoicingMomentOf(month);
  closesAt = month.cycle().closesAt;
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
  await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: true }).expect(204);
  return id;
}

/** Un payeur au compte : mandat B2B actif, détenteur joignable, un bon du mois. */
async function payer(entityId: string, options: { readonly siren?: string } = {}) {
  seq += 1;
  const company = await createCompany(ctx.prisma, {
    raisonSociale: `Boulangerie ${String(seq)}`,
    ...(options.siren === undefined ? {} : { siren: options.siren }),
  });
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
  await ctx.prisma.order.create({
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
  });
  return company;
}

interface HourlyReport {
  readonly runs: readonly { readonly outcome: string }[];
  readonly invoiceRuns: readonly { readonly month: string; readonly outcome: string }[];
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

async function issueByHand(entityId: string): Promise<MonthlyInvoiceReportView> {
  return jsonBody<MonthlyInvoiceReportView>(
    await staff()
      .post(MONTHLY)
      .send({ legalEntityId: entityId, month: month.toString() })
      .expect(200),
  );
}

describe("la facture du mois, puis le lot qui l'encaisse (E4)", () => {
  it("un mois complet : la facture à 23h55, le lot du 1er au montant des factures, l'avis qui les cite", async () => {
    const id = await entity();
    const company = await payer(id);

    const evening = await invoicePass();

    expect(evening.runs).toEqual([
      { legalEntityId: id, month: month.toString(), outcome: "issued" },
    ]);
    // Le passage de 23h55 ne prépare pas le lot : la clôture n'est pas atteinte.
    expect(await ctx.prisma.collectionBatch.count()).toBe(0);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow({
      where: { payerCompanyId: company.id },
    });
    expect(invoice.number).toMatch(NUMBER);
    expect(invoice.issuedOn.toISOString().slice(0, 10)).toBe(lastDayOf(month));
    expect(invoice.paymentMeans).toEqual({ code: "59", mandateReference: "RUM-E4-1" });

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
        issuedOn: lastDayOf(month),
      },
    ]);

    const replay = await issueByHand(id);
    expect(replay).toMatchObject({ issued: [], blocked: [], alreadyInvoiced: 1 });
    expect(await ctx.prisma.invoice.count()).toBe(1);
    const screen = await view(id);
    expect(screen.month).toBe(month.toString());
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
      [first.id, 1, lastDayOf(month)],
      [second.id, 2, lateDay],
    ]);
    expect((await view(id)).invoices.map((i) => i.issuedOn)).toContain(lateDay);
  });

  it("avant le dernier jour 23h55 : 409, aucune facture", async () => {
    const id = await entity();
    await payer(id);
    clock.set(new Date(issuableFrom.getTime() - HOUR_MS));
    const current = StatementMonth.containing(clock.now());

    const response = await staff()
      .post(MONTHLY)
      .send({ legalEntityId: id, month: current.toString() })
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
  await ctx.prisma.order.create({
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
  });
  return { id: site.id, reference };
}
