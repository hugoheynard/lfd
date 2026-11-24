/**
 * E2E — **le document du devis de période et son envoi** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD4 et QD5).
 *
 * Ce que seul le vrai serveur prouve : le fait `period_quote.issued` livré
 * par le relais après la clôture, le PDF rangé au stockage des pièces client
 * sous `quotes/<entité>/<numéro>-v<version>.pdf`, la demande d'e-mail écrite
 * dans la boîte d'envoi avec sa pièce PAR RÉFÉRENCE ; « Renvoyer le devis »
 * sous la clé d'intention de l'écran, la version n+1 rangée après
 * l'ancienne `superseded` — la clé étrangère composite emportant ses
 * commandes —, et le refus d'un devis remplacé.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double ; on lit les demandes
 * dans la boîte d'envoi, comme les autres e2e d'e-mail.
 *
 * ⚠️ La fiche Chorus en `on_period_quote` est posée par Prisma (le geste la
 * refuse encore, Q1), et la commande « modifiée » est annulée par Prisma : le
 * sujet est l'empreinte du devis, pas le geste d'annulation. Aucune date
 * absolue comparée à l'horloge : le mois est le précédent du jour du test.
 */
import { Buffer } from "node:buffer";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { CustomerDocumentStore } from "../src/platform/storage/customer-document-store.js";
import { transferSinceMonthStart } from "./bank-transfer-scene.js";
import {
  closesAt,
  ctx,
  DAY_MS,
  month,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { jsonBody, serviceDay } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser, handOver } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeServedOrder, type ServedOrder } from "./served-order.js";

useCollectionReturnScene();

const MONTHLY = "/admin/accounting/monthly-invoices";
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
    auth0Sub: "quote-doc-army-owner",
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

/** La clôture du mois, puis le relais : le fait du devis livré à son abonné. */
async function closeAndDrain(entityId: string): Promise<void> {
  await staff()
    .post(MONTHLY)
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
}

/** Les demandes d'e-mail « devis » écrites dans la boîte d'envoi, par clé. */
async function quoteMails(): Promise<readonly { key: string; payload: string }[]> {
  const rows = await ctx.prisma.outboxMessage.findMany({
    where: { type: "mail.requested", key: { startsWith: "mail.requested:period-quote" } },
    orderBy: { key: "asc" },
    select: { key: true, payload: true },
  });
  return rows.map((row) => ({ key: row.key, payload: JSON.stringify(row.payload) }));
}

function resend(
  quoteId: string,
  intent = freshIntent(),
): ReturnType<ReturnType<typeof staff>["post"]> {
  return staff().post(`/admin/period-quotes/${quoteId}/resend`).set(INTENT_KEY, intent);
}

async function scene(): Promise<{
  readonly entityId: string;
  readonly payer: Army;
  readonly orders: readonly ServedOrder[];
}> {
  const entityId = await setUpEntity(staff);
  const payer = await army(entityId);
  const orders = [await served(payer, 3), await served(payer, 2)];
  await closeAndDrain(entityId);
  return { entityId, payer, orders };
}

describe("le devis de période part à la clôture", () => {
  it("son PDF est rangé une fois, et la demande d'e-mail le joint par référence", async () => {
    const { entityId, payer } = await scene();

    const quote = await ctx.prisma.periodQuote.findFirstOrThrow();
    const key = `quotes/${entityId}/${quote.number}-v1.pdf`;
    const pdf = await ctx.app.get(CustomerDocumentStore).readIfPresent(key);
    expect(pdf).not.toBeNull();
    expect(Buffer.from(pdf ?? []).toString("latin1", 0, 5)).toBe("%PDF-");
    expect(Buffer.from(pdf ?? []).toString("latin1")).not.toContain("factur-x.xml");

    const mails = await quoteMails();
    expect(mails.map((mail) => mail.key)).toEqual([
      `mail.requested:period-quote:${quote.id}:user:${payer.ownerId}`,
    ]);
    expect(mails[0]?.payload).toContain('"pdfStored"');
    expect(mails[0]?.payload).toContain(key);
    expect(mails[0]?.payload).not.toContain("pdfBase64");
    expect(mails[0]?.payload).toContain("customer.period-quote");
  });
});

describe("« Renvoyer le devis »", () => {
  it("les commandes inchangées : la même version repart, sous la clé de l'intention", async () => {
    const { payer } = await scene();
    const quote = await ctx.prisma.periodQuote.findFirstOrThrow();
    const intent = freshIntent();

    const response = await resend(quote.id, intent).expect(200);

    expect(jsonBody<{ quoteId: string }>(response)).toEqual({ quoteId: quote.id });
    expect(await ctx.prisma.periodQuote.count()).toBe(1);
    const keys = (await quoteMails()).map((mail) => mail.key);
    expect(keys).toContain(`mail.requested:period-quote-resend:${intent}:user:${payer.ownerId}`);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: quote.id, type: "period_quote.resent" },
      select: { payload: true },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.payload).toMatchObject({ renewed: false, version: 1, recipientCount: 1 });
  });

  it("une commande annulée : la version 2 est rangée, la 1 remplacée avec ses commandes, et la 2 part", async () => {
    const { entityId, payer, orders } = await scene();
    const v1 = await ctx.prisma.periodQuote.findFirstOrThrow();
    const [kept, dropped] = orders;
    await ctx.prisma.order.update({
      where: { id: dropped?.id ?? "" },
      data: { status: "cancelled" },
    });

    const response = await resend(v1.id).expect(200);
    await ctx.drain();

    const v2Id = jsonBody<{ quoteId: string }>(response).quoteId;
    expect(v2Id).not.toBe(v1.id);
    const all = await ctx.prisma.periodQuote.findMany({
      orderBy: { version: "asc" },
      include: { orders: true },
    });
    expect(all.map((quote) => [quote.id, quote.number, quote.version, quote.state])).toEqual([
      [v1.id, v1.number, 1, "superseded"],
      [v2Id, v1.number, 2, "awaiting"],
    ]);
    expect(all[0]?.orders.every((line) => line.quoteState === "superseded")).toBe(true);
    expect(all[1]?.orders.map((line) => line.orderId)).toEqual([kept?.id]);
    expect(all[1]?.fingerprint).not.toBe(v1.fingerprint);
    const fact = await ctx.prisma.outboxMessage.findUnique({
      where: { key: `period_quote.issued:${v2Id}` },
    });
    expect(fact?.payload).toEqual({ quoteId: v2Id });
    const v2Pdf = `quotes/${entityId}/${v1.number}-v2.pdf`;
    expect(await ctx.app.get(CustomerDocumentStore).readIfPresent(v2Pdf)).not.toBeNull();
    const keys = (await quoteMails()).map((mail) => mail.key);
    expect(keys).toContain(`mail.requested:period-quote:${v2Id}:user:${payer.ownerId}`);
  });

  it("un devis remplacé ne se renvoie pas : 409 nommé", async () => {
    const { orders } = await scene();
    const v1 = await ctx.prisma.periodQuote.findFirstOrThrow();
    await ctx.prisma.order.update({
      where: { id: orders[1]?.id ?? "" },
      data: { status: "cancelled" },
    });
    await resend(v1.id).expect(200);

    const refused = await resend(v1.id);

    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: "accounting.period_quote.not_awaiting",
    });
    expect(jsonBody<{ message: string }>(refused).message).toContain(`Le devis ${v1.number}`);
  });
});
