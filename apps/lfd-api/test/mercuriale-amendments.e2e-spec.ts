/**
 * E2E de **l'avenant daté d'une mercuriale**
 * (`documentation/pricing/plan-tarif-date-sur-une-reference.md`, T2–T3).
 *
 * Ce que seul ce niveau prouve : le verrou `FOR UPDATE` contre deux écritures
 * concurrentes, la relecture datée sur la vraie base (avenants rangés après
 * l'instant lu compris), le scellement « a facturé » qui voit un prix venu
 * d'un avenant, et le prix d'un sous-compte à la caisse.
 *
 * Aucune date absolue : un avenant n'est jamais rétroactif, il part donc de
 * « maintenant » (`validFrom` absent), et les instants lus sont relus en base.
 */
import { randomUUID } from "node:crypto";

import type {
  CompanyPricingView,
  CreatedIdResponse,
  SaleReferenceDecisionView,
} from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { ProductCatalogReader } from "../src/b2b/catalog/domain/ports/product-catalog.reader.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { Pricer } from "../src/b2b/pricing/application/pricer.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { staffViewer } from "../src/b2b/catalog/domain/catalog-viewer.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_avenant") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Dans la grille. */
const GRID_SKU = "VIE-001-1";
/** Ajouté par avenant : une référence de vente `-1`, depuis la bascule du défaut. */
const AMENDED_SKU = "VIE-002-1";
const GRID_CENTS = 150;
const AMENDED_CENTS = 180;
const REASON = "Pain au chocolat ajouté à la demande du chef";

const DELIVERY = {
  label: "Établissement",
  ligne1: "1 route du Lac",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

async function companyWithMercuriale(): Promise<{ companyId: string; mercurialeId: string }> {
  const company = await createCompany(ctx.prisma, { status: "active" });
  await staff()
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .send({
      label: "Mercuriale de saison",
      validFrom: daysAgo(30),
      validTo: daysAgo(-365),
      lines: [{ sku: GRID_SKU, unitPriceMillicents: millicentsFromCents(GRID_CENTS) }],
    })
    .expect(201);
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId: company.id },
    select: { id: true },
  });
  return { companyId: company.id, mercurialeId: row.id };
}

const amend = (companyId: string, mercurialeId: string, body: Record<string, unknown> = {}) =>
  staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`)
    .send({
      reason: REASON,
      lines: [{ sku: AMENDED_SKU, unitPriceMillicents: millicentsFromCents(AMENDED_CENTS) }],
      ...body,
    });

/** Le prix que rend le vrai `Pricer` — au présent, ou en relecture datée. */
async function priceOf(companyId: string, sku: string, at?: Date): Promise<number> {
  const found = await ctx.app.get(ProductCatalogReader).resolve(sku, staffViewer("pro"));
  if (found === null) {
    throw new Error(`Le catalogue e2e ne connaît pas « ${sku} ».`);
  }
  const lot = await ctx.app.get(Pricer).load({
    articles: [{ article: found.article, quantity: 1 }],
    companyId,
    at,
    caller: "cart",
  });
  return lot.price(sku, 1).finalMillicents;
}

async function canonical(sku: string): Promise<number> {
  const found = await ctx.app.get(ProductCatalogReader).resolve(sku, staffViewer("pro"));
  if (found === null) {
    throw new Error(`Le catalogue e2e ne connaît pas « ${sku} ».`);
  }
  const lot = await ctx.app.get(Pricer).load({
    articles: [{ article: found.article, quantity: 1 }],
    companyId: "co_sans_tarif",
    caller: "cart",
  });
  return lot.price(sku, 1).canonicalMillicents;
}

async function amendmentRow(mercurialeId: string) {
  return ctx.prisma.companyMercurialeAmendment.findFirstOrThrow({ where: { mercurialeId } });
}

describe("poser un avenant", () => {
  it("donne le prix de l'avenant à l'article ajouté, et l'acte `amended` au journal", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();

    const created = jsonBody<{ amendmentId: string }>(
      await amend(companyId, mercurialeId).expect(201),
    );

    expect(await priceOf(companyId, AMENDED_SKU)).toBe(millicentsFromCents(AMENDED_CENTS));
    const event = await ctx.prisma.pricingEvent.findFirstOrThrow({
      where: { subjectId: mercurialeId, act: "amended" },
    });
    expect(event.reason).toBe(REASON);
    expect((await amendmentRow(mercurialeId)).id).toBe(created.amendmentId);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "company_mercuriale.amended" } }),
    ).toBe(1);
  });

  it("refuse un motif vide au schéma, et une date passée au domaine", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();

    await amend(companyId, mercurialeId, { reason: "" }).expect(400);
    await amend(companyId, mercurialeId, { validFrom: daysAgo(1) }).expect(400);
    expect(await ctx.prisma.companyMercurialeAmendment.count()).toBe(0);
  });

  it("🔴 deux avenants concurrents sur le même article : un seul passe", async () => {
    // Le verrou `FOR UPDATE` puis la relecture dans la même transaction : sans
    // eux, chacun chargerait l'état d'avant et les deux passeraient.
    const { companyId, mercurialeId } = await companyWithMercuriale();

    const statuses = (
      await Promise.all([amend(companyId, mercurialeId), amend(companyId, mercurialeId)])
    )
      .map((response) => response.status)
      .sort();

    expect(statuses).toEqual([201, 409]);
    expect(await ctx.prisma.companyMercurialeAmendment.count({ where: { mercurialeId } })).toBe(1);
  });

  it("ne rouvre pas la porte d'une seconde mercuriale : la pose reste refusée", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    await amend(companyId, mercurialeId).expect(201);

    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale`)
      .send({
        label: "Seconde",
        validFrom: daysAgo(-1),
        validTo: daysAgo(-30),
        lines: [{ sku: AMENDED_SKU, unitPriceMillicents: millicentsFromCents(170) }],
      })
      .expect(409);
  });
});

describe("la relecture datée", () => {
  it("rend le prix d'AVANT pour un instant antérieur à l'avenant", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    const before = new Date(Date.parse(daysAgo(0)) - 60_000);

    await amend(companyId, mercurialeId).expect(201);

    expect(await priceOf(companyId, AMENDED_SKU, before)).toBe(await canonical(AMENDED_SKU));
    expect(await priceOf(companyId, AMENDED_SKU)).toBe(millicentsFromCents(AMENDED_CENTS));
  });

  it("retrouve l'avenant après la clôture du document, pour un instant d'avant", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    await amend(companyId, mercurialeId).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/close`)
      .send({ id: mercurialeId, reason: "renégociée" })
      .expect(200);

    const amendment = await amendmentRow(mercurialeId);
    expect(amendment.archivedAt).not.toBeNull();
    const between = new Date(
      (amendment.validFrom.getTime() + (amendment.archivedAt?.getTime() ?? 0)) / 2,
    );
    expect(await priceOf(companyId, AMENDED_SKU, between)).toBe(millicentsFromCents(AMENDED_CENTS));
    expect(await priceOf(companyId, AMENDED_SKU)).toBe(await canonical(AMENDED_SKU));
  });
});

/** Une vraie commande, par la caisse : c'est elle qui atteste que l'avenant a facturé. */
async function placeOrderFor(companyId: string, sub: string, sku: string): Promise<void> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
  const pickup = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "La Daille",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  await ctx
    .asSub(sub)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      companyId,
      requestedDeliveryDate: serviceDay(),
      note: "",
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: pickup.id,
      lines: [{ sku, quantity: 1 }],
    })
    .expect(201);
}

describe("🔴 ce qu'un avenant a facturé est scellé (seconde contradiction, B1)", () => {
  it("refuse de reposer par-dessus une période facturée par le seul avenant", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    await amend(companyId, mercurialeId).expect(201);
    await placeOrderFor(companyId, "auth0|acheteur_avenant", AMENDED_SKU);
    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/close`)
      .send({ id: mercurialeId, reason: "renégociée" })
      .expect(200);

    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale`)
      .send({
        label: "Reposée",
        validFrom: daysAgo(30),
        validTo: daysAgo(-365),
        lines: [{ sku: AMENDED_SKU, unitPriceMillicents: millicentsFromCents(170) }],
      })
      .expect(409);
  });
});

describe("le sous-compte", () => {
  it("🔴 paie le prix de l'avenant du principal — à la caisse", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    const site = jsonBody<CreatedIdResponse>(
      await staff()
        .post(`/admin/companies/${companyId}/sub-accounts`)
        .send({ enseigne: "Site de Chamonix", deliveryAddress: DELIVERY, follows: [] })
        .expect(201),
    ).id;
    await staff().post(`/admin/companies/${site}/pricing-follow`).expect(204);
    await amend(companyId, mercurialeId).expect(201);

    const sub = "auth0|site_avenant";
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    await attachTo(ctx.prisma, user.id, site);
    const quoted = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
      await ctx
        .asSub(sub)
        .post("/orders/quote")
        .send({ companyId: site, lines: [{ sku: AMENDED_SKU, quantity: 1 }] })
        .expect(200),
    );

    expect(quoted.lines[0]?.unitPriceMillicents).toBe(millicentsFromCents(AMENDED_CENTS));
  });
});

describe("les lecteurs voient l'avenant (T4)", () => {
  it("la liste des décisions d'une référence trouve la mercuriale par son avenant", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    await amend(companyId, mercurialeId).expect(201);

    const decisions = jsonBody<readonly SaleReferenceDecisionView[]>(
      await staff().get(`/admin/pricing/sale-references/${AMENDED_SKU}/decisions`).expect(200),
    );

    expect(decisions.filter((decision) => decision.kind === "mercuriale")).toHaveLength(1);
  });

  it("le dossier staff liste l'avenant et sa ligne", async () => {
    const { companyId, mercurialeId } = await companyWithMercuriale();
    await amend(companyId, mercurialeId).expect(201);

    const view = jsonBody<CompanyPricingView>(
      await staff().get(`/admin/pricing/companies/${companyId}`).expect(200),
    );
    const [mercuriale] = view.mercuriales;

    expect(mercuriale?.skuCount).toBe(2);
    expect(mercuriale?.amendments).toEqual([
      expect.objectContaining({ reason: REASON, openedSkus: [AMENDED_SKU], endedSkus: [] }),
    ]);
    expect(mercuriale?.lines.find((line) => line.sku === AMENDED_SKU)).toMatchObject({
      status: "active",
      amendmentReason: REASON,
    });
  });
});
