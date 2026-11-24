/**
 * E2E — **« Engagement reçu » sur un devis de période** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD2 et QD6).
 *
 * Ce que seul le vrai serveur prouve : le mode posé par le geste de la fiche
 * Chorus, la clôture qui range le devis, puis, dans UNE transaction, le
 * numéro écrit sur les commandes sous leur verrou, la facture émise avec le
 * numéro (BT-13) et le code service (BT-10), son issue, le devis `invoiced`
 * — la clé étrangère composite emportant ses commandes —, et le fait au
 * journal ; le rejeu d'une même intention qui ne réémet rien ; le refus
 * d'une empreinte changée qui n'écrit rien ; un autre payeur de la clôture
 * laissé tel quel ; la correction d'engagement refusée sur une commande en
 * devis ; la facture dans la file « À déposer » de Chorus.
 *
 * La commande « modifiée » est annulée par Prisma : le sujet est l'empreinte
 * du devis, pas le geste d'annulation. Aucune date absolue comparée à
 * l'horloge : le mois est le précédent du jour du test, l'horloge est celle
 * de la scène.
 */
import {
  addDays,
  BUDGET_COMMITMENT_ERRORS,
  instantToLocal,
  type ChorusInvoicesView,
  type MonthlyInvoiceReportView,
} from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { transferSinceMonthStart } from "./bank-transfer-scene.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  month,
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
/** Le SKU que `placeServedOrder` commande, et que la mercuriale cite. */
const CITED = "VIE-001-1";
const SERVICE_CODE = "SERV-RH";
const COMMITMENT = "1300012345";
/** Le délai légal d'un service de l'État (`public_state`). */
const PUBLIC_DEADLINE_DAYS = 30;

interface Payer {
  readonly companyId: string;
  readonly ownerId: string;
}

/**
 * L'armée : publique, au compte, au virement, son tarif convenu posé, puis
 * son mode passé au devis de période PAR LE GESTE de la fiche Chorus.
 */
async function army(entityId: string): Promise<Payer> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Caserne des Alpes" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { formeJuridique: "public_state", grantedTerms: ["monthly"] },
  });
  await transferSinceMonthStart(entityId, company.id);
  const owner = await createUser(ctx.prisma, {
    auth0Sub: "commitment-army-owner",
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
  await staff()
    .put(`/admin/companies/${company.id}/chorus-routing`)
    .send({
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: SERVICE_CODE,
      commitmentTiming: "on_period_quote",
      checkedOn: month.cycle().startsAt.toISOString().slice(0, 10),
    })
    .expect(204);
  return { companyId: company.id, ownerId: owner.id };
}

/** Un payeur privé au compte, au virement : la scène d'un voisin de clôture. */
async function neighbour(entityId: string): Promise<Payer> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Port" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await transferSinceMonthStart(entityId, company.id);
  const owner = await createUser(ctx.prisma, {
    auth0Sub: "commitment-neighbour-owner",
    email: "compta@port.test",
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  return { companyId: company.id, ownerId: owner.id };
}

/** Un bon servi `daysBefore` jours avant la clôture, remis et soldé. */
async function served(payer: Payer, daysBefore: number): Promise<ServedOrder> {
  const servedAt = new Date(closesAt.getTime() - daysBefore * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: payer.ownerId,
    companyId: payer.companyId,
    servedAt,
  });
  await handOver(ctx.prisma, { ...order, createdAt: servedAt });
  return order;
}

/** Remis mais jamais soldé : la facture du payeur est refusée, il est signalé. */
async function unsettled(payer: Payer): Promise<ServedOrder> {
  const servedAt = new Date(closesAt.getTime() - 4 * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: payer.ownerId,
    companyId: payer.companyId,
    servedAt,
  });
  await ctx.prisma.order.update({ where: { id: order.id }, data: receivedColumns(servedAt) });
  return order;
}

async function close(entityId: string): Promise<MonthlyInvoiceReportView> {
  const response = await staff()
    .post(MONTHLY)
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  return jsonBody<MonthlyInvoiceReportView>(response);
}

/** Le devis rangé par la clôture. */
async function quoteId(): Promise<string> {
  const quote = await ctx.prisma.periodQuote.findFirstOrThrow({ select: { id: true } });
  return quote.id;
}

function receive(id: string, intent: string, number = COMMITMENT) {
  return staff()
    .post(`/admin/period-quotes/${id}/commitment`)
    .set(INTENT_KEY, intent)
    .send({ number });
}

async function numbersOf(orders: readonly ServedOrder[]): Promise<readonly (string | null)[]> {
  const rows = await ctx.prisma.order.findMany({
    where: { id: { in: orders.map((order) => order.id) } },
    orderBy: { orderNumber: "asc" },
    select: { budgetCommitmentNumber: true },
  });
  return rows.map((row) => row.budgetCommitmentNumber);
}

describe("« Engagement reçu » : du devis à la facture", () => {
  it("écrit le numéro, émet la facture du devis avec BT-13 et BT-10, et passe le devis facturé", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const orders = [await served(payer, 3), await served(payer, 2)];
    const routing = await ctx.prisma.companyChorusRouting.findUniqueOrThrow({
      where: { companyId: payer.companyId },
    });
    expect(routing.commitmentTiming).toBe("on_period_quote");
    const placed = await ctx.prisma.order.findMany({
      where: { companyId: payer.companyId },
      select: { budgetCommitmentNumber: true, budgetCommitmentServiceCode: true },
    });
    expect(placed).toEqual([
      { budgetCommitmentNumber: null, budgetCommitmentServiceCode: SERVICE_CODE },
      { budgetCommitmentNumber: null, budgetCommitmentServiceCode: SERVICE_CODE },
    ]);
    expect(await close(entityId)).toMatchObject({ issued: [], blocked: [], quoted: 1 });
    const id = await quoteId();
    const quote = await ctx.prisma.periodQuote.findUniqueOrThrow({ where: { id } });

    const response = await receive(id, freshIntent()).expect(200);

    const { invoiceId } = jsonBody<{ invoiceId: string }>(response);
    const invoice = await ctx.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { orders: true },
    });
    const issuedOn = instantToLocal(clock.now()).day;
    expect(invoice).toMatchObject({
      payerCompanyId: payer.companyId,
      budgetCommitmentNumber: COMMITMENT,
      budgetCommitmentServiceCode: SERVICE_CODE,
      totalTtcCents: quote.totalTtcCents,
    });
    expect(invoice.issuedOn.toISOString().slice(0, 10)).toBe(issuedOn);
    expect(invoice.dueOn?.toISOString().slice(0, 10)).toBe(addDays(issuedOn, PUBLIC_DEADLINE_DAYS));
    expect(invoice.orders.map((line) => line.orderId).sort()).toEqual(
      orders.map((order) => order.id).sort(),
    );
    expect(await numbersOf(orders)).toEqual([COMMITMENT, COMMITMENT]);
    const invoiced = await ctx.prisma.periodQuote.findUniqueOrThrow({
      where: { id },
      include: { orders: true },
    });
    expect(invoiced).toMatchObject({ state: "invoiced", invoiceId });
    expect(invoiced.orders.map((line) => line.quoteState)).toEqual(["invoiced", "invoiced"]);
    const outcome = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow({
      where: { payerCompanyId: payer.companyId },
    });
    expect(outcome).toMatchObject({
      outcome: "issued",
      invoiceId,
      periodClosesAt: closesAt,
      periodStartsAt: quote.periodStartsAt,
      budgetCommitmentNumber: COMMITMENT,
      budgetCommitmentServiceCode: SERVICE_CODE,
    });
    const received = await ctx.prisma.outboxMessage.findMany({
      where: { type: "order.budget_commitment_received" },
    });
    expect(received).toHaveLength(2);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: "invoice.issued" } })).toBe(1);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "period_quote.commitment_received" },
    });
    expect(journal.map((entry) => entry.payload)).toEqual([
      expect.objectContaining({
        commitmentNumber: COMMITMENT,
        invoice: { id: invoiceId, name: invoice.number },
        orderCount: 2,
      }),
    ]);

    // La facture part comme toute facture : son PDF rendu, son avis demandé.
    await ctx.drain();
    const rendered = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(rendered.documentKey).not.toBeNull();
    expect(
      await ctx.prisma.outboxMessage.count({
        where: { type: "mail.requested", key: { startsWith: "mail.requested:invoice.notice:" } },
      }),
    ).toBe(1);
  });

  it("rejouée sous la même intention, rend la même facture sans rien réémettre", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    await served(payer, 2);
    await close(entityId);
    const id = await quoteId();
    const intent = freshIntent();

    const first = jsonBody<{ invoiceId: string }>(await receive(id, intent).expect(200));
    const replay = jsonBody<{ invoiceId: string }>(await receive(id, intent).expect(200));

    expect(replay).toEqual(first);
    expect(await ctx.prisma.invoice.count()).toBe(1);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: "invoice.issued" } })).toBe(1);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "period_quote.commitment_received" } }),
    ).toBe(1);
  });

  it("refuse une empreinte changée sans rien écrire, et un nouvel essai sur un devis facturé", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const orders = [await served(payer, 3), await served(payer, 2)];
    await close(entityId);
    const id = await quoteId();
    const [, cancelled] = orders;
    if (cancelled === undefined) {
      throw new TypeError("deux commandes servies");
    }
    await ctx.prisma.order.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });

    const refused = await receive(id, freshIntent());

    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "accounting.period_quote.commitment_outdated",
      message: expect.stringContaining("n'est plus à jour : renvoyez-le avant") as unknown,
    });
    expect(await ctx.prisma.periodQuote.findUniqueOrThrow({ where: { id } })).toMatchObject({
      state: "awaiting",
      invoiceId: null,
    });
    expect(await numbersOf(orders)).toEqual([null, null]);
    expect(await ctx.prisma.invoice.count()).toBe(0);
    expect(await ctx.prisma.invoiceMonthlyOutcome.count()).toBe(0);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "order.budget_commitment_received" } }),
    ).toBe(0);
  });

  it("refuse des commandes qui ne font plus UNE facture, et défait le numéro déjà écrit", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const orders = [await served(payer, 3), await served(payer, 2)];
    await close(entityId);
    const [, moved] = orders;
    if (moved === undefined) {
      throw new TypeError("deux commandes servies");
    }
    // Le code service n'entre pas dans l'empreinte : le devis reste à jour,
    // mais les commandes numérotées tombent dans deux factures.
    await ctx.prisma.order.update({
      where: { id: moved.id },
      data: { budgetCommitmentServiceCode: "SERV-AUTRE" },
    });

    const refused = await receive(await quoteId(), freshIntent());

    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "accounting.period_quote.commitment_groups",
    );
    expect(await numbersOf(orders)).toEqual([null, null]);
    expect(await ctx.prisma.invoice.count()).toBe(0);
    expect(await ctx.prisma.periodQuote.findFirstOrThrow()).toMatchObject({ state: "awaiting" });
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "order.budget_commitment_received" } }),
    ).toBe(0);
  });

  it("refuse un numéro mal formé (400), sans rien écrire", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const order = await served(payer, 2);
    await close(entityId);

    const refused = await receive(await quoteId(), freshIntent(), "13000\n12345");

    expect(refused.status).toBe(400);
    expect(jsonBody<{ code: string }>(refused).code).toBe(BUDGET_COMMITMENT_ERRORS.invalid);
    expect(await numbersOf([order])).toEqual([null]);
    expect(await ctx.prisma.invoice.count()).toBe(0);
  });

  it("ne touche pas un autre payeur bloqué de la même clôture", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const other = await neighbour(entityId);
    await served(payer, 2);
    await unsettled(other);
    const report = await close(entityId);
    expect(report.blocked.map((blocked) => blocked.payerCompanyId)).toEqual([other.companyId]);
    const before = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow({
      where: { payerCompanyId: other.companyId },
    });
    const signalled = await ctx.prisma.activityEvent.count({
      where: { type: "invoice.signalled" },
    });

    await receive(await quoteId(), freshIntent()).expect(200);

    const after = await ctx.prisma.invoiceMonthlyOutcome.findFirstOrThrow({
      where: { payerCompanyId: other.companyId },
    });
    expect(after).toEqual(before);
    expect(await ctx.prisma.invoice.findMany({ select: { payerCompanyId: true } })).toEqual([
      { payerCompanyId: payer.companyId },
    ]);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "invoice.signalled" } })).toBe(
      signalled,
    );
  });
});

describe("une commande en devis", () => {
  it("refuse la correction de son engagement : 409 nommé, qui renvoie au devis", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    const order = await served(payer, 2);
    await close(entityId);
    const { number } = await ctx.prisma.periodQuote.findFirstOrThrow({ select: { number: true } });

    const response = await staff()
      .put(`/admin/orders/${order.id}/budget-commitment`)
      .send({ budgetCommitment: { number: "", serviceCode: "SERV-AUTRE" } });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string; message: string }>(response)).toMatchObject({
      code: BUDGET_COMMITMENT_ERRORS.inPeriodQuote,
      message: expect.stringContaining(`devis de période ${number}`) as unknown,
    });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.budgetCommitmentServiceCode).toBe(SERVICE_CODE);
  });

  it("sa facture, une fois l'engagement reçu, attend son dépôt sur Chorus", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await army(entityId);
    await served(payer, 2);
    await close(entityId);

    const { invoiceId } = jsonBody<{ invoiceId: string }>(
      await receive(await quoteId(), freshIntent()).expect(200),
    );

    const toDeposit = jsonBody<ChorusInvoicesView>(
      await staff().get("/admin/accounting/chorus/invoices/to-deposit").expect(200),
    );
    expect(toDeposit.invoices.map((one) => [one.invoiceId, one.chorus.state])).toEqual([
      [invoiceId, "to_deposit"],
    ]);
  });
});
