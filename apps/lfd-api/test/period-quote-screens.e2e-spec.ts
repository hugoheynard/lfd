/**
 * E2E — **les écrans du devis de période** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD7).
 *
 * Ce que seul le vrai serveur prouve : la liste des devis d'une fiche client
 * lue sur `period_quote`, celle d'un site qui suit la facturation du payeur
 * (le devis est au PAYEUR), le PDF rangé par l'envoi automatique servi au
 * staff, et l'avertissement `period_quote_awaiting` qui apparaît sur la
 * fiche et au compteur du menu une fois le devis vieux de quinze jours.
 *
 * La fiche Chorus en `on_period_quote` et le suivi du site sont posés par
 * Prisma (le sujet n'est pas leur geste) ; le vieillissement du devis aussi,
 * relatif à l'horloge de la scène. Aucune date absolue comparée à l'horloge.
 */
import { Buffer } from "node:buffer";

import type { AdminCompanyDetailView, CompanyPeriodQuotesView } from "@lfd/contracts";

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
import { daysAgo, jsonBody, serviceDay } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser, handOver } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeServedOrder } from "./served-order.js";

useCollectionReturnScene();

/** Le SKU que `placeServedOrder` commande, et que la mercuriale cite. */
const CITED = "VIE-001-1";

/** L'armée : publique, au compte, au virement, sur devis de période, son tarif convenu posé. */
async function army(entityId: string): Promise<string> {
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
    auth0Sub: "quote-screens-army-owner",
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
  const servedAt = new Date(closesAt.getTime() - 2 * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    servedAt,
  });
  await handOver(ctx.prisma, { ...order, createdAt: servedAt });
  return company.id;
}

/** Un site qui suit la facturation de l'armée, sans commande à lui. */
async function siteOf(payerId: string): Promise<string> {
  const site = await createCompany(ctx.prisma, { raisonSociale: "Caserne — mess des officiers" });
  await ctx.prisma.company.update({ where: { id: site.id }, data: { parentCompanyId: payerId } });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: site.id,
      parentId: payerId,
      aspect: "billing",
      validFrom: new Date(daysAgo(400)),
      validTo: null,
    },
  });
  return site.id;
}

/** L'armée et son devis, rangé et envoyé par la clôture du mois. */
async function scene(): Promise<{ readonly payerId: string; readonly quoteId: string }> {
  const entityId = await setUpEntity(staff);
  const payerId = await army(entityId);
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
  const quote = await ctx.prisma.periodQuote.findFirstOrThrow({ select: { id: true } });
  return { payerId, quoteId: quote.id };
}

async function quotesOf(companyId: string): Promise<CompanyPeriodQuotesView> {
  return jsonBody<CompanyPeriodQuotesView>(
    await staff().get(`/admin/companies/${companyId}/period-quotes`).expect(200),
  );
}

async function warningKinds(companyId: string): Promise<readonly string[]> {
  const detail = jsonBody<AdminCompanyDetailView>(
    await staff().get(`/admin/companies/${companyId}`).expect(200),
  );
  return detail.warnings.map((warning) => warning.kind);
}

async function warningsCount(): Promise<number> {
  return jsonBody<{ count: number }>(
    await staff().get("/admin/companies/warnings-count").expect(200),
  ).count;
}

describe("les devis de période d'une fiche client", () => {
  it("liste le devis en attente sur la fiche du payeur, et sur celle de son site", async () => {
    const { payerId, quoteId } = await scene();
    const siteId = await siteOf(payerId);

    const own = await quotesOf(payerId);
    expect(own).toMatchObject({ payerCompanyId: payerId, payerName: "Caserne des Alpes" });
    expect(own.quotes).toHaveLength(1);
    expect(own.quotes[0]).toMatchObject({
      quoteId,
      version: 1,
      state: "awaiting",
      orderCount: 1,
      replaced: null,
      invoice: null,
    });
    expect(own.quotes[0]?.number).toMatch(/^D-\d{8}-\d+$/);

    const fromSite = await quotesOf(siteId);
    expect(fromSite.payerCompanyId).toBe(payerId);
    expect(fromSite.quotes.map((quote) => quote.quoteId)).toEqual([quoteId]);
  });

  it("sert au staff le PDF rangé par l'envoi automatique", async () => {
    const { quoteId } = await scene();
    const quote = await ctx.prisma.periodQuote.findUniqueOrThrow({ where: { id: quoteId } });

    const response = await staff()
      .get(`/admin/period-quotes/${quoteId}/document`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain(`${quote.number}-v1.pdf`);
    expect(Buffer.from(response.body as Buffer).toString("latin1", 0, 5)).toBe("%PDF-");
  });
});

describe("l'avertissement « devis sans engagement »", () => {
  it("se tait avant quinze jours, puis apparaît sur la fiche du payeur et au compteur", async () => {
    const { payerId, quoteId } = await scene();
    const siteId = await siteOf(payerId);
    expect(await warningKinds(payerId)).not.toContain("period_quote_awaiting");
    const before = await warningsCount();

    await ctx.prisma.periodQuote.update({
      where: { id: quoteId },
      // Quinze jours avant l'horloge de la scène, qui est celle du serveur.
      data: { createdAt: new Date(clock.now().getTime() - 15 * DAY_MS) },
    });

    expect(await warningKinds(payerId)).toContain("period_quote_awaiting");
    expect(await warningKinds(siteId)).not.toContain("period_quote_awaiting");
    expect(await warningsCount()).toBe(before + 1);
  });
});
