/**
 * E2E de **la fin qu'une clôture pose** — régression R17.
 *
 * R17 (2026-09-09) a fait borner la fenêtre à la clôture, dans le DOMAINE :
 * `close()` / `archive()` calculent `validTo` par `closingWindowAt`. Mais les
 * quatre dépôts n'écrivaient que les colonnes de cycle de vie — la fin calculée
 * se perdait entre l'agrégat et la base (trouvé par vitruve le 2026-10-29).
 *
 * Le symptôme qui coûte : une mercuriale qui a facturé puis a été close gardait
 * sa fin d'origine, chevauchait donc toute période future dans
 * `archivedOverlapping`, et **toute nouvelle pose chez ce client** tombait en
 * `PricedPeriodIsSealedError` — un 409 sans sortie.
 *
 * Seul ce niveau le prouve : les tests d'application doublent le dépôt, et un
 * doublé garde l'agrégat entier, fin comprise.
 */
import { randomUUID } from "node:crypto";

import { millicentsFromCents } from "@lfd/money";

import { Pricer } from "../src/b2b/pricing/application/pricer.js";
import { ProductCatalogReader } from "../src/b2b/catalog/domain/ports/product-catalog.reader.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
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

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** VIE-001 est semé au catalogue e2e. */
const SKU = "VIE-001";
const NEGOTIATED_CENTS = 150;
const BUYER_SUB = "auth0|acheteur_cloture";

/** Une fin LOINTAINE : c'est la clôture qui doit fermer, pas la borne posée d'avance. */
const FAR_END = () => daysAgo(-365);

const poseMercuriale = (companyId: string, window: { from: string; to: string }) =>
  staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale de saison",
      validFrom: window.from,
      validTo: window.to,
      lines: [{ sku: SKU, unitPriceMillicents: millicentsFromCents(NEGOTIATED_CENTS) }],
    });

async function mercurialeIdOf(companyId: string): Promise<string | undefined> {
  const view = jsonBody<{ mercuriales: readonly { id: string }[] }>(
    await staff().get(`/admin/pricing/companies/${companyId}`).expect(200),
  );
  return view.mercuriales[0]?.id;
}

/** Une vraie commande, par la caisse : c'est elle qui atteste que la mercuriale a facturé. */
async function placeOrderFor(companyId: string): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER_SUB });
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
  const placed = await ctx
    .asSub(BUYER_SUB)
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
      lines: [{ sku: SKU, quantity: 1 }],
    })
    .expect(201);
  return jsonBody<{ id: string }>(placed).id;
}

/** Le prix que la relecture DATÉE rend, par le vrai `Pricer`. */
async function pricedAt(companyId: string, at: Date): Promise<number> {
  const resolved = await ctx.app.get(ProductCatalogReader).resolveMany([SKU], "pro");
  const found = resolved.get(SKU);
  if (found === undefined) {
    throw new Error(`Le catalogue e2e ne connaît pas « ${SKU} ».`);
  }
  const lot = await ctx.app.get(Pricer).load({
    articles: [{ article: found.article, quantity: 1 }],
    companyId,
    at,
    caller: "cart",
  });
  return lot.price(SKU, 1).finalMillicents;
}

describe("🔴 régression R17 — clore une mercuriale qui a facturé", () => {
  it("laisse poser la suivante, et la relecture datée garde l'ancien prix", async () => {
    const company = await createCompany(ctx.prisma);
    await poseMercuriale(company.id, { from: daysAgo(30), to: FAR_END() }).expect(201);
    const orderId = await placeOrderFor(company.id);
    await staff()
      .post(`/admin/pricing/companies/${company.id}/mercuriale/close`)
      .send({ id: await mercurialeIdOf(company.id), reason: "renégociée" })
      .expect(200);

    // La fin est en base, et c'est l'instant de la clôture.
    const closed = await ctx.prisma.companyMercuriale.findFirstOrThrow({
      where: { companyId: company.id },
      select: { validTo: true, archivedAt: true },
    });
    expect(closed.validTo).toEqual(closed.archivedAt);

    // Avant le correctif : 409 PricedPeriodIsSealedError, la close couvrant
    // encore toute l'année à venir.
    await poseMercuriale(company.id, { from: daysAgo(-1), to: daysAgo(-200) }).expect(201);

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { createdAt: true },
    });
    expect(await pricedAt(company.id, order.createdAt)).toBe(millicentsFromCents(NEGOTIATED_CENTS));
  });
});

/** La même fin, pour les trois autres familles closes par `closingWindowAt`. */
describe("🔴 régression R17 — la fin de la clôture est persistée", () => {
  it("règle de prix : archiver écrit `valid_to`", async () => {
    const created = await staff()
      .post("/admin/pricing/rules")
      .send({
        stage: "promotion",
        scope: { type: "global", id: null },
        audience: { type: "all", id: null },
        minQuantity: null,
        effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1_000 },
        label: "Promotion close",
        validFrom: daysAgo(30),
        validTo: null,
      })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(created);

    await staff().post(`/admin/pricing/rules/${id}/archive`).send({ reason: null }).expect(204);

    const row = await ctx.prisma.priceRule.findUniqueOrThrow({
      where: { id },
      select: { validTo: true, archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.validTo).toEqual(row.archivedAt);
  });

  it("barème de volume : archiver écrit `valid_to`", async () => {
    const created = await staff()
      .put("/admin/pricing/volume-ladders")
      .send({
        scope: { type: "product", id: SKU },
        audience: { type: "all", id: null },
        unit: "percent",
        tiers: [{ minQuantity: 50, value: 500 }],
        label: "Barème clos",
        validFrom: daysAgo(30),
        validTo: null,
      })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(created);

    await staff()
      .post(`/admin/pricing/volume-ladders/${id}/archive`)
      .send({ reason: null })
      .expect(204);

    const row = await ctx.prisma.volumeLadder.findUniqueOrThrow({
      where: { id },
      select: { validTo: true, archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.validTo).toEqual(row.archivedAt);
  });

  it("engagement de volume : clore écrit `valid_to`", async () => {
    const company = await createCompany(ctx.prisma);
    const signed = await staff()
      .post("/admin/pricing/commitments")
      .send({
        companyId: company.id,
        scope: { type: "product", id: SKU },
        promisedQuantity: 6_000,
        validFrom: daysAgo(30),
        validTo: FAR_END(),
      })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(signed);

    await staff().post(`/admin/pricing/commitments/${id}/close`).send({ reason: null }).expect(204);

    const row = await ctx.prisma.volumeCommitment.findUniqueOrThrow({
      where: { id },
      select: { validTo: true, archivedAt: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.validTo).toEqual(row.archivedAt);
  });
});
