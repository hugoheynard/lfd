/**
 * 🔴 **Le devis de la boutique prédit la passation — invité ET inscrit.**
 *
 * Né d'un constat : « la ligne d'une passation invitée se fige à 200 000
 * millicentimes alors que le devis anonyme du même panier dit 250 237 ». Ce
 * fichier tranche si c'est une affaire d'unité (la commande d'un particulier
 * se fige en `exact_ht`, la ligne porte donc un prix RECALÉ sur son TTC) ou un
 * vrai écart. Ce qui doit être égal est ce que le client PAIE : le total TTC du
 * devis, le total écrit sur la commande, et le montant de l'intention de
 * règlement. Le prix unitaire figé n'est pas comparé : il change de
 * représentation, pas de somme.
 */
import { randomUUID } from "node:crypto";

import type {
  CreatedPickupResponse,
  PlaceShopOrderPayload,
  PlacedOrderResponse,
  PromotionTermsPayload,
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
    fulfillment: { kind: "any", pickupId: null },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

async function pose(over: Partial<PromotionTermsPayload>): Promise<void> {
  await staff().post("/admin/promotions").send(terms(over)).expect(201);
  ctx.app.get(PricingMaterialsCache).invalidate();
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

type Basket = PlaceShopOrderPayload["lines"];

/** Les montants qu'un client PAIE, lus des trois côtés. */
interface Paid {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

const WEIGHED = { sku: SKU, quantity: 1_250, saleUnit: "weight" as const };

async function sellByWeight(): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: SKU },
    data: {
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 200,
      priceMillicents: 4_000_000,
      publicTtcCents: 4_220,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 3_999_052 } },
    },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
}

const quoteView = (view: ShopQuoteView): Paid => ({
  subtotalCents: view.subtotalHtCents,
  discountCents: view.discountCents,
  totalCents: view.totalCents,
});

async function orderPaid(orderId: string): Promise<Paid> {
  const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
  };
}

/** L'invité passe par la route : l'instant est gelé à l'ingress. */
async function guestPlaces(
  site: string,
  lines: Basket,
): Promise<{ id: string; intentCents: number }> {
  const response = await ctx
    .http()
    .post("/shop/orders")
    .send({
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
      lines,
    })
    .expect(201);
  await ctx.drain();
  const placed = jsonBody<PlacedOrderResponse>(response);
  return { id: placed.id, intentCents: placed.payment?.amountCents ?? -1 };
}

/**
 * L'invité passé par le HANDLER appelé nu, hors requête — job, consommateur,
 * semis. Régression du 2026-10-30 : l'horloge y rendait un instant frais à
 * chaque lecture, la porte du prix jugeait la question « passée » d'une
 * milliseconde et rescellait l'article au prix de l'historique canonique, qui
 * ne porte que le prix PRO (200 000 figés là où le devis dit 250 237).
 */
async function guestPlacesOutsideRequest(site: string, lines: Basket): Promise<string> {
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
      lines,
    }),
  );
  await ctx.drain();
  return placed.id;
}

async function registeredPlaces(site: string, lines: Basket): Promise<string> {
  return placeAsRegistered({ ...pickupOrder(site), lines });
}

const SCENES: readonly {
  readonly name: string;
  readonly lines: Basket;
  readonly weight: boolean;
  readonly promotion: boolean;
}[] = [
  { name: "sans promotion", lines: [{ sku: SKU, quantity: 4 }], weight: false, promotion: false },
  {
    name: "sous une promotion publique",
    lines: [{ sku: SKU, quantity: 12 }],
    weight: false,
    promotion: true,
  },
  { name: "avec un article au poids", lines: [WEIGHED], weight: true, promotion: false },
  { name: "au poids ET sous promotion", lines: [WEIGHED], weight: true, promotion: true },
];

describe("le devis et la passation d'un particulier — même total payé", () => {
  it.each(SCENES)("invité $name : devis anonyme = commande = intention", async (scene_) => {
    const site = await scene();
    if (scene_.weight) await sellByWeight();
    if (scene_.promotion) {
      await pose({
        audiences: [{ kind: "everyone", companyId: null }],
        effect: { kind: "percent_off", value: 1_500 },
      });
    }
    const view = jsonBody<ShopQuoteView>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({ lines: scene_.lines, fulfillment: { method: "pickup", pickupAddressId: site } })
        .expect(200),
    );
    const placed = await guestPlaces(site, scene_.lines);
    const paid = await orderPaid(placed.id);
    expect(paid.totalCents).toBe(quoteView(view).totalCents);
    expect(placed.intentCents).toBe(view.totalCents);
    expect(paid).toEqual(quoteView(view));
  });

  it.each(SCENES)("inscrit $name : devis reconnu = commande", async (scene_) => {
    const site = await scene();
    if (scene_.weight) await sellByWeight();
    if (scene_.promotion) {
      await pose({
        audiences: [{ kind: "everyone", companyId: null }],
        effect: { kind: "percent_off", value: 1_500 },
      });
    }
    const view = jsonBody<ShopQuoteView>(
      await ctx
        .asSub(REGISTERED)
        .post("/shop/quote/mine")
        .send({ lines: scene_.lines, fulfillment: { method: "pickup", pickupAddressId: site } })
        .expect(200),
    );
    const id = await registeredPlaces(site, scene_.lines);
    expect(await orderPaid(id)).toEqual(quoteView(view));
  });
});

describe("hors requête — le handler appelé nu (régression du 2026-10-30)", () => {
  it.each(SCENES)("invité $name : devis anonyme = commande, au prix public", async (scene_) => {
    const site = await scene();
    if (scene_.weight) await sellByWeight();
    if (scene_.promotion) {
      await pose({
        audiences: [{ kind: "everyone", companyId: null }],
        effect: { kind: "percent_off", value: 1_500 },
      });
    }
    const view = jsonBody<ShopQuoteView>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({ lines: scene_.lines, fulfillment: { method: "pickup", pickupAddressId: site } })
        .expect(200),
    );
    const id = await guestPlacesOutsideRequest(site, scene_.lines);
    expect(await orderPaid(id)).toEqual(quoteView(view));
  });
});
