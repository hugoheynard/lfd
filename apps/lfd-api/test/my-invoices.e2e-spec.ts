/**
 * E2E de la page **« Mes factures »** côté serveur (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`, lot P1).
 *
 * Ce que seul le vrai SQL prouve : le statut de règlement se lit sur les
 * vraies tables du prélèvement (lot, ligne, retour, état des bons), aux
 * vraies transitions — émise, mise en lot, déposée, rejetée ; le total dû
 * ne suit pas les filtres ; le mur des rôles tient (autre rôle 403,
 * non-membre 404).
 *
 * ⚠️ Mandat, bons et membres écrits par Prisma : même dette que
 * `collection-returns.e2e-spec.ts`, dont la scène est reprise. Aucune date
 * absolue : le mois est le PRÉCÉDENT du jour du test.
 */
import type { MyIssuedInvoicesView } from "@lfd/contracts";

import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { invoicedPayer, setUpEntity } from "./collection-returns-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const HOUR_MS = 60 * 60 * 1000;
const COLLECTION = "/admin/accounting/collection";
const RETURNS = "/admin/accounting/collection-returns";
const TOTAL_TTC = 10_550;

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};
const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
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
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function member(companyId: string, sub: string, role: CustomerRole): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@port.test` });
  await attachTo(ctx.prisma, user.id, companyId, role);
  return sub;
}

/** La facture du mois du payeur de la scène ; rend la société et la pièce. */
async function issuedInvoice(): Promise<{ companyId: string; invoiceId: string }> {
  const entityId = await setUpEntity(staff);
  const companyId = await invoicedPayer(ctx, staff, entityId, closesAt);
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
  const invoice = await ctx.prisma.invoice.findFirstOrThrow({
    where: { payerCompanyId: companyId },
  });
  return { companyId, invoiceId: invoice.id };
}

async function list(sub: string, companyId: string, query = ""): Promise<MyIssuedInvoicesView> {
  return jsonBody<MyIssuedInvoicesView>(
    await ctx.asSub(sub).get(`/companies/${companyId}/invoices${query}`).expect(200),
  );
}

describe("« Mes factures » : le statut suit le prélèvement (§7.1)", () => {
  it("émise → prévue à l'échéance ; en lot → prévue au jour du lot ; déposée → prélevée ; rejet → à régulariser", async () => {
    const { companyId } = await issuedInvoice();
    const compta = await member(companyId, "my-compta", CustomerRole.billing);
    const invoice = await ctx.prisma.invoice.findFirstOrThrow();
    const dueOn = invoice.dueOn?.toISOString().slice(0, 10) ?? null;

    const issued = await list(compta, companyId);
    expect(issued.invoices[0]?.settlement).toEqual({
      status: "collection_planned",
      date: dueOn,
      otherInvoicesOnDebit: 0,
    });
    expect(issued.amountDue).toEqual({
      totalCents: TOTAL_TTC,
      invoiceCount: 1,
      rejectedCount: 0,
      rejectedCents: 0,
    });

    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff()
      .post(`${COLLECTION}/batches`)
      .send({ legalEntityId: invoice.legalEntityId })
      .expect(201);
    await ctx.drain();
    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow();
    const day = batch.requestedCollectionDay?.toISOString().slice(0, 10) ?? null;
    expect((await list(compta, companyId)).invoices[0]?.settlement).toMatchObject({
      status: "collection_planned",
      date: day,
    });

    await staff().get(`${COLLECTION}/batches/${batch.id}/file.xml`).expect(200);
    await staff().post(`${COLLECTION}/batches/${batch.id}/deposit`).expect(204);
    const deposited = await list(compta, companyId);
    expect(deposited.invoices[0]?.settlement).toMatchObject({ status: "collected", date: day });
    expect(deposited.amountDue.totalCents).toBe(0);

    const returnedOn = daysAgo(1).slice(0, 10);
    await staff()
      .post(`${RETURNS}/batches/${batch.id}/lines/1`)
      .send({ kind: "reject", reasonCode: "AM04", reasonLabel: null, returnedOn, feeCents: null })
      .expect(201);
    const rejected = await list(compta, companyId);
    expect(rejected.invoices[0]?.settlement).toEqual({
      status: "collection_rejected",
      date: returnedOn,
      otherInvoicesOnDebit: 0,
    });
    expect(rejected.amountDue).toEqual({
      totalCents: TOTAL_TTC,
      invoiceCount: 1,
      rejectedCount: 1,
      rejectedCents: TOTAL_TTC,
    });
  });

  it("un bon réglé autrement avant tout lot : en cours de traitement, hors du total dû (Q-E)", async () => {
    const { companyId } = await issuedInvoice();
    const order = await ctx.prisma.order.findFirstOrThrow({ where: { companyId } });

    await staff()
      .post(`${COLLECTION}/orders/${order.id}/settle-otherwise`)
      .send({ note: "Virement reçu" })
      .expect(204);

    const view = await list("r5-owner", companyId);
    expect(view.invoices[0]?.settlement).toEqual({
      status: "processing",
      date: null,
      otherInvoicesOnDebit: 0,
    });
    expect(view.amountDue.totalCents).toBe(0);
  });
});

describe("« Mes factures » : filtres et mur", () => {
  it("les filtres choisissent les lignes, pas le total dû ; un mois sans année : 400", async () => {
    const { companyId, invoiceId } = await issuedInvoice();
    const invoice = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const [year, month] = invoice.issuedOn.toISOString().slice(0, 7).split("-").map(Number);

    const same = await list("r5-owner", companyId, `?year=${String(year)}&month=${String(month)}`);
    expect(same.invoices.map((one) => one.invoiceId)).toEqual([invoiceId]);
    const otherYear = await list("r5-owner", companyId, `?year=${String((year ?? 0) - 1)}`);
    expect(otherYear.invoices).toEqual([]);
    expect(otherYear.amountDue.totalCents).toBe(TOTAL_TTC);
    const notes = await list("r5-owner", companyId, "?kind=credit_note");
    expect(notes.invoices).toEqual([]);
    expect(notes.amountDue.invoiceCount).toBe(1);

    await ctx.asSub("r5-owner").get(`/companies/${companyId}/invoices?month=3`).expect(400);
    await ctx.asSub("r5-owner").get(`/companies/${companyId}/invoices?kind=receipt`).expect(400);
  });

  it("un contact sans le rôle facturation : 403 ; une autre société : 404", async () => {
    const { companyId } = await issuedInvoice();
    const commis = await member(companyId, "my-commis", CustomerRole.orders);
    const other = await createCompany(ctx.prisma, { raisonSociale: "Autre maison" });
    const stranger = await member(other.id, "my-stranger", CustomerRole.owner);

    await ctx.asSub(commis).get(`/companies/${companyId}/invoices`).expect(403);
    await ctx.asSub(stranger).get(`/companies/${companyId}/invoices`).expect(404);
  });
});
