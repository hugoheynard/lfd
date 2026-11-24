/**
 * E2E — **le devis de période à la clôture** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD3, QD5, v5).
 *
 * Ce que seul le vrai serveur prouve : le moment de l'engagement lu sur la
 * fiche Chorus en base, le devis rangé par les index partiels et la clé
 * étrangère composite, le fait durable écrit dans la même transaction,
 * `uninvoicedOrders` qui n'en reprend pas les commandes, le relevé et le
 * dossier qui les gardent au cycle du devis, et la vue de la période.
 *
 * ⚠️ La fiche Chorus en `on_period_quote` est posée par Prisma : le geste la
 * refuse encore (Q1, levée par Q5). La mercuriale passe par sa route.
 *
 * Aucune date absolue comparée à l'horloge : le mois est le précédent du jour
 * du test, l'horloge est celle de la scène.
 */
import {
  CHORUS_ROUTING_ERRORS,
  type CycleStatementView,
  type InvoiceDossierView,
  type MonthlyInvoiceReportView,
  type MonthlyInvoicesView,
} from "@lfd/contracts";

import { invoicingMomentOf } from "../src/lafoliecoffee/accounting/domain/services/invoicing-closures.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { transferSinceMonthStart } from "./bank-transfer-scene.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  HOUR_MS,
  invoicedPayer,
  month,
  nextClosesAt,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { jsonBody, serviceDay } from "./e2e-harness.js";
import {
  addBillingAddress,
  attachTo,
  createCompany,
  createUser,
  handOver,
  receivedColumns,
} from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeServedOrder, type ServedOrder } from "./served-order.js";

useCollectionReturnScene();

const MONTHLY = "/admin/accounting/monthly-invoices";
const STATEMENTS = "/admin/accounting/statements";
const DOSSIERS = "/admin/accounting/invoice-dossiers";
/** Le SKU que `placeServedOrder` commande, et que la mercuriale cite. */
const CITED = "VIE-001-1";

interface Army {
  readonly companyId: string;
  readonly ownerId: string;
}

/** L'armée : publique, au compte, au virement, sur devis de période, son tarif convenu posé. */
async function army(entityId: string): Promise<Army> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Caserne des Alpes" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { formeJuridique: "public_state", grantedTerms: ["monthly"] },
  });
  await ctx.prisma.companyChorusRouting.create({
    data: {
      companyId: company.id,
      commitmentRequired: true,
      serviceCodeRequired: false,
      defaultServiceCode: "",
      commitmentTiming: "on_period_quote",
      checkedOn: new Date(`${month.cycle().startsAt.toISOString().slice(0, 10)}T00:00:00.000Z`),
      checkedByStaffId: "staff-e2e",
    },
  });
  await transferSinceMonthStart(entityId, company.id);
  const owner = await createUser(ctx.prisma, {
    auth0Sub: "quote-army-owner",
    email: "intendance@caserne.test",
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  await staff()
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Tarif convenu de la caserne",
      validFrom: new Date(month.cycle().startsAt.getTime() - DAY_MS).toISOString(),
      validTo: `${serviceDay(60)}T00:00:00.000Z`,
      lines: [{ sku: CITED, unitPriceMillicents: 90_000 }],
    })
    .expect(201);
  return { companyId: company.id, ownerId: owner.id };
}

/** Un bon de l'armée servi `daysBefore` jours avant la clôture, remis et soldé. */
async function served(payer: Army, daysBefore: number): Promise<ServedOrder> {
  const servedAt = new Date(closesAt.getTime() - daysBefore * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: payer.ownerId,
    companyId: payer.companyId,
    servedAt,
  });
  await handOver(ctx.prisma, { ...order, createdAt: servedAt });
  return order;
}

/** Remis mais jamais soldé : une anomalie que la facture refuse de prendre. */
async function unsettled(payer: Army): Promise<ServedOrder> {
  const servedAt = new Date(closesAt.getTime() - 4 * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: payer.ownerId,
    companyId: payer.companyId,
    servedAt,
  });
  await ctx.prisma.order.update({ where: { id: order.id }, data: receivedColumns(servedAt) });
  return order;
}

async function close(entityId: string, at: Date): Promise<MonthlyInvoiceReportView> {
  const response = await staff()
    .post(MONTHLY)
    .send({ legalEntityId: entityId, periodClosesAt: at.toISOString() })
    .expect(200);
  return jsonBody<MonthlyInvoiceReportView>(response);
}

async function statementOrders(companyId: string, at: Date): Promise<readonly string[]> {
  const view = jsonBody<CycleStatementView>(
    await staff()
      .get(`${STATEMENTS}/companies/${companyId}?periodClosesAt=${at.toISOString()}`)
      .expect(200),
  );
  return view.groups.flatMap((group) => group.orders.map((order) => order.orderNumber));
}

async function dossierOrders(companyId: string, at: Date): Promise<readonly string[]> {
  const view = jsonBody<InvoiceDossierView>(
    await staff()
      .get(`${DOSSIERS}/companies/${companyId}?periodClosesAt=${at.toISOString()}`)
      .expect(200),
  );
  return view.orders.map((order) => order.reference);
}

describe("la clôture d'un payeur sur devis de période", () => {
  it("range un devis, n'émet aucune facture, écrit son fait, et la vue de la période le montre", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const [first, second] = [await served(payer, 3), await served(payer, 2)];

    const report = await close(entityId, closesAt);

    expect(report).toMatchObject({ issued: [], blocked: [], quoted: 1 });
    expect(await ctx.prisma.invoice.count()).toBe(0);
    expect(await ctx.prisma.invoiceMonthlyOutcome.count()).toBe(0);
    const quote = await ctx.prisma.periodQuote.findFirstOrThrow({ include: { orders: true } });
    // Le TTC de la facture calculée une fois (TVA sur l'ensemble), celui du dossier.
    const dossier = jsonBody<InvoiceDossierView>(
      await staff()
        .get(`${DOSSIERS}/companies/${payer.companyId}?periodClosesAt=${closesAt.toISOString()}`)
        .expect(200),
    );
    const total = dossier.invoice.totalCents;
    expect(Math.abs(total - (first.totalCents + second.totalCents))).toBeLessThanOrEqual(1);
    expect(quote).toMatchObject({
      version: 1,
      state: "awaiting",
      payerCompanyId: payer.companyId,
      payerName: "Caserne des Alpes",
      mandateId: "",
      serviceCode: "",
      periodClosesAt: closesAt,
      totalTtcCents: total,
      invoiceId: null,
    });
    expect(quote.number).toMatch(/^D-\d{8}-1$/u);
    expect(quote.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(quote.orders.map((line) => [line.orderId, line.quoteState]).sort()).toEqual(
      [
        [first.id, "awaiting"],
        [second.id, "awaiting"],
      ].sort(),
    );
    const facts = await ctx.prisma.outboxMessage.findMany({
      where: { type: "period_quote.issued" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([{ quoteId: quote.id }]);

    const view = jsonBody<MonthlyInvoicesView>(
      await staff().get(`${MONTHLY}?legalEntityId=${entityId}`).expect(200),
    );
    expect(view.periodClosesAt).toBe(closesAt.toISOString());
    expect(view.invoices).toEqual([]);
    expect(view.signaled).toEqual([]);
    expect(view.periodQuotes).toEqual([
      {
        quoteId: quote.id,
        number: quote.number,
        version: 1,
        payerCompanyId: payer.companyId,
        payerName: "Caserne des Alpes",
        serviceCode: null,
        totalCents: total,
        orderCount: 2,
        createdAt: quote.createdAt.toISOString(),
      },
    ]);
  });

  it("rejouée, elle ne double rien ; la clôture suivante ne reprend pas les commandes du devis", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    await served(payer, 2);
    await close(entityId, closesAt);

    const replay = await close(entityId, closesAt);
    clock.set(new Date(invoicingMomentOf(nextClosesAt).getTime() + 2 * 60 * 1000));
    const next = await close(entityId, nextClosesAt);

    expect(replay).toMatchObject({ issued: [], blocked: [], quoted: 0 });
    expect(next).toMatchObject({ issued: [], blocked: [], quoted: 0 });
    expect(await ctx.prisma.periodQuote.count()).toBe(1);
    expect(await ctx.prisma.periodQuoteOrder.count()).toBe(1);
    expect(await ctx.prisma.invoice.count()).toBe(0);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: "period_quote.issued" } })).toBe(
      1,
    );
  });

  it("un autre payeur de la même clôture, public et à la commande, est facturé normalement", async () => {
    const entityId = await setUpEntity(staff);
    const school = await invoicedPayer(ctx, staff, entityId, closesAt);
    await ctx.prisma.company.update({
      where: { id: school },
      data: { formeJuridique: "public_local", raisonSociale: "École du Port" },
    });
    await ctx.prisma.companyChorusRouting.create({
      data: {
        companyId: school,
        commitmentRequired: false,
        serviceCodeRequired: false,
        defaultServiceCode: "",
        commitmentTiming: "at_order",
        checkedOn: new Date(`${month.cycle().startsAt.toISOString().slice(0, 10)}T00:00:00.000Z`),
        checkedByStaffId: "staff-e2e",
      },
    });
    await transferSinceMonthStart(entityId, school);
    const payer = await army(entityId);
    await served(payer, 2);

    const report = await close(entityId, closesAt);

    expect(report.quoted).toBe(1);
    expect(report.blocked).toEqual([]);
    expect(report.issued.map((issued) => issued.payerCompanyId)).toEqual([school]);
    const invoices = await ctx.prisma.invoice.findMany({ select: { payerCompanyId: true } });
    expect(invoices).toEqual([{ payerCompanyId: school }]);
    expect(await ctx.prisma.periodQuote.count({ where: { payerCompanyId: payer.companyId } })).toBe(
      1,
    );
  });

  it("une commande non soldée reste hors du devis, et est signalée comme aujourd'hui", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const billable = await served(payer, 2);
    const anomaly = await unsettled(payer);

    const report = await close(entityId, closesAt);

    expect(report.quoted).toBe(1);
    expect(report.blocked.map((blocked) => blocked.payerCompanyId)).toEqual([payer.companyId]);
    const lines = await ctx.prisma.periodQuoteOrder.findMany({ select: { orderId: true } });
    expect(lines).toEqual([{ orderId: billable.id }]);
    // Le chemin d'aujourd'hui : sa facture ne part pas, le bloqueur la nomme.
    const outcome = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow();
    expect(outcome.outcome).toBe("blocked");
    expect(outcome.message).toContain(`Le bon ${anomaly.orderNumber} est remis`);
    expect(await ctx.prisma.invoice.count()).toBe(0);
  });

  it("le relevé et le dossier gardent les commandes du devis au cycle de sa clôture, pas au suivant", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const order = await served(payer, 2);
    await close(entityId, closesAt);

    expect(await statementOrders(payer.companyId, closesAt)).toEqual([order.orderNumber]);
    expect(await dossierOrders(payer.companyId, closesAt)).toEqual([order.orderNumber]);
    // La période suivante est ouverte : on la lit une fois commencée.
    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    expect(await statementOrders(payer.companyId, nextClosesAt)).toEqual([]);
    expect(await dossierOrders(payer.companyId, nextClosesAt)).toEqual([]);
  });

  it("une commande en devis compte comme non facturée : le mode ne se change pas (409)", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    await served(payer, 2);
    await close(entityId, closesAt);

    const response = await staff()
      .put(`/admin/companies/${payer.companyId}/chorus-routing`)
      .send({
        commitmentRequired: true,
        serviceCodeRequired: false,
        defaultServiceCode: "",
        commitmentTiming: "at_order",
        checkedOn: closesAt.toISOString().slice(0, 10),
      });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      CHORUS_ROUTING_ERRORS.timingLockedByOrders,
    );
  });
});
