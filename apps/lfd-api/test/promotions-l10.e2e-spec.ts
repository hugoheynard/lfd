/**
 * E2E du lot **L10** du plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`
 * (§ 13.7, § 8, § 13.2 RAYON), sur le vrai Postgres :
 *
 * 1. au point LIGNE, la porte d'entrée de la route atteint le prix : pour un
 *    même article, un particulier inscrit et un invité ne paient pas le même
 *    prix sous une promotion « inscrits » — au rayon, au devis et à la
 *    passation ;
 * 2. le devis anonyme dit ce qu'une connexion ouvrirait (`signInOffer`) ;
 * 3. une promotion de LIVRAISON est servie à la passation et au devis ;
 * 4. au rayon, une promotion d'acheminement est MENTIONNÉE
 *    (`fulfillmentOffers`), sans baisser le prix.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import { randomUUID } from "node:crypto";

import type {
  CreatedPickupResponse,
  PlacedOrderResponse,
  PromotionTermsPayload,
  ShopCatalogueView,
  ShopQuoteView,
} from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const REGISTERED = "auth0|l10-inscrit";
const SERVICE_DAY = serviceDay();
const SKU = "VIE-001-1";
const LINES = [{ sku: SKU, quantity: 4 }];

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_l10_${String(intentCounter)}`,
      clientSecret: `pi_l10_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
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
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Le décor : un point, un particulier inscrit, une zone livrée — puis la bascule. */
async function scene(): Promise<string> {
  await createUser(ctx.prisma, { auth0Sub: REGISTERED });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 500 },
  });
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return site;
}

function terms(over: Partial<PromotionTermsPayload>): Record<string, unknown> {
  return {
    internalName: "Promotion L10",
    label: { fr: "Merci d'être inscrit", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 2_000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    validFrom: daysAgo(1),
    validTo: null,
    audiences: [{ kind: "individuals_registered", companyId: null }],
    fulfillment: { kind: "displayed_price" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

async function pose(over: Partial<PromotionTermsPayload>): Promise<void> {
  await staff().post("/admin/promotions").send(terms(over)).expect(201);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

function quoteBody(fulfillment: unknown): Record<string, unknown> {
  return { lines: LINES, fulfillment };
}

async function anonymousQuote(fulfillment: unknown = null): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.http().post("/shop/quote").send(quoteBody(fulfillment)).expect(200),
  );
}

async function registeredQuote(fulfillment: unknown = null): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.asSub(REGISTERED).post("/shop/quote/mine").send(quoteBody(fulfillment)).expect(200),
  );
}

function unitPriceOf(view: ShopQuoteView): number | undefined {
  return view.lines.find((line) => line.sku === SKU)?.unitPriceMillicents;
}

function pickupOrder(site: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    pickupAddressId: site,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: LINES,
  };
}

async function placeAsRegistered(body: Record<string, unknown>): Promise<string> {
  return jsonBody<PlacedOrderResponse>(
    await ctx.asSub(REGISTERED).post("/orders").send(body).expect(201),
  ).id;
}

async function placeAsGuest(site: string): Promise<string> {
  const placed = await ctx.app.get(PlaceShopOrderHandler).execute(
    new PlaceShopOrderCommand({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: site,
      requestedDeliveryDate: SERVICE_DAY,
      note: "",
      lines: LINES,
    }),
  );
  await ctx.drain();
  return placed.id;
}

async function frozenUnitPrice(orderId: string): Promise<number | undefined> {
  const line = await ctx.prisma.orderLine.findFirst({ where: { orderId, sku: SKU } });
  return line?.unitPriceMillicents;
}

describe("la porte d'entrée au point ligne (L10)", () => {
  it("même article, prix différent : l'inscrit a la promotion « inscrits », l'invité non", async () => {
    const site = await scene();
    const before = await anonymousQuote();
    await pose({});

    const guest = await anonymousQuote();
    const registered = await registeredQuote();
    expect(unitPriceOf(guest)).toBe(unitPriceOf(before));
    expect(unitPriceOf(registered)).toBe(Math.round(((unitPriceOf(before) ?? 0) * 8) / 10));

    // La passation suit le devis : la porte vient de la route, puis de la commande.
    // L'invité est comparé à SON devis par le TOTAL payé : sa ligne se fige en
    // `exact_ht`, son prix unitaire change donc de représentation, pas de somme.
    // (Ce test comparait l'invité à sa propre passation d'avant la promotion, en
    // l'expliquant par `exact_ht` : c'était en fait le prix PRO, figé hors
    // requête par une seconde lecture d'horloge — corrigé le 2026-10-30.)
    const registeredOrder = await frozenUnitPrice(await placeAsRegistered(pickupOrder(site)));
    expect(registeredOrder).toBe(unitPriceOf(registered));
    const guestQuote = await anonymousQuote({ method: "pickup", pickupAddressId: site });
    const guestOrder = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: await placeAsGuest(site) },
    });
    expect(guestOrder.totalCents).toBe(guestQuote.totalCents);
    expect(guestOrder.subtotalCents).toBe(guestQuote.subtotalHtCents);
  });

  it("au rayon : la route publique sert l'invité, la route reconnue l'inscrit", async () => {
    await scene();
    await pose({});
    const priceAt = async (request: ReturnType<E2eContext["http"]>, path: string) =>
      jsonBody<ShopCatalogueView>(await request.get(path).expect(200)).items.find(
        (item) => item.sku === SKU,
      );

    const guest = await priceAt(ctx.http(), "/shop/catalogue");
    const registered = await priceAt(ctx.asSub(REGISTERED), "/shop/catalogue/mine");

    expect(registered?.unitPriceMillicents).toBeLessThan(guest?.unitPriceMillicents ?? 0);
    expect(registered?.catalogPriceMillicents).toBe(guest?.unitPriceMillicents);
  });

  it("le devis anonyme dit ce qu'une connexion ouvrirait ; le devis reconnu non", async () => {
    await scene();
    expect(await anonymousQuote()).not.toHaveProperty("signInOffer");
    await pose({});

    expect((await anonymousQuote()).signInOffer).toEqual({
      effect: { kind: "percent", basisPoints: 2_000 },
    });
    expect(await registeredQuote()).not.toHaveProperty("signInOffer");
  });
});

describe("les promotions de livraison (L10)", () => {
  const DELIVERY = {
    label: "",
    ligne1: "2 rue Neuve",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
  };

  it("sont servies au devis et à la passation, le port à côté", async () => {
    await scene();
    await pose({
      internalName: "Livraison d'automne",
      audiences: [{ kind: "everyone", companyId: null }],
      fulfillment: { kind: "basket", pickup: "none", delivery: "all" },
      effect: { kind: "percent_off", value: 1_000 },
    });

    const quoted = await registeredQuote({ method: "delivery", codePostal: "73150" });
    expect(quoted.discountCents).toBeGreaterThan(0);
    expect(quoted.deliveryFeeCents).toBeGreaterThan(0);

    const orderId = await placeAsRegistered({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      pickupAddressId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      requestedWindow: { start: null, end: "10:00" },
      deliveryAddress: DELIVERY,
      note: "",
      lines: LINES,
    });
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.discountCents).toBe(quoted.discountCents);
    expect(order.discountPromotionId).not.toBeNull();
    expect(order.deliveryFeeCents).toBeGreaterThan(0);
  });
});

describe("la mention au rayon (L10)", () => {
  it("mentionne la promotion de retrait d'un point, sans baisser le prix", async () => {
    const site = await scene();
    const before = await ctx.http().get("/shop/catalogue").expect(200);
    await pose({
      internalName: "Retrait au Labo",
      audiences: [{ kind: "everyone", companyId: null }],
      fulfillment: { kind: "basket", pickup: { points: [site] }, delivery: "none" },
    });

    const item = jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").expect(200),
    ).items.find((entry) => entry.sku === SKU);
    const priceBefore = jsonBody<ShopCatalogueView>(before).items.find(
      (entry) => entry.sku === SKU,
    )?.unitPriceMillicents;

    expect(item?.unitPriceMillicents).toBe(priceBefore);
    expect(item?.fulfillmentOffers).toEqual([
      {
        effect: { kind: "percent", basisPoints: 2_000 },
        fulfillment: { pickup: { points: [site] }, delivery: "none" },
      },
    ]);
  });
});
