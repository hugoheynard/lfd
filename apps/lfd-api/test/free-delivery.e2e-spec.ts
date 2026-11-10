/**
 * E2E du **franco** (plan `documentation/promotions/plan-livraison-offerte.md`,
 * sous-lot 1b) : le seuil se résout comme le frais (zone, sinon réglage global
 * de l'audience), se compte sur les marchandises HT remisées, et rend la
 * livraison gratuite au devis comme à la passation. La commande fige le seuil
 * et ce que la course aurait coûté ; une révision rejuge le franco contre le
 * seuil FIGÉ ; un seuil perdu entre le devis et la commande est refusé
 * (`orders.total_changed`).
 */
import { randomUUID } from "node:crypto";

import { ORDER_TOTAL_CHANGED, type PlacedOrderResponse, type ShopQuoteView } from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = cardGatewayDouble("pi_free_delivery");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const PRO_SUB = "auth0|franco-pro";
const PRO_FEE = { mode: "amount", cents: 900 } as const;
const SERVICE_DAY = serviceDay();
const ZONE = {
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: 2_000 },
};
const LINES = (quantity: number) => [{ sku: "VIE-001-1", quantity }];
const QUOTE = { lines: LINES(10), fulfillment: { method: "delivery", codePostal: "73150" } };
const COURIER_ADDR = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function setGlobal(body: Record<string, unknown>): Promise<void> {
  await staff().patch("/admin/delivery-pricing").send(body).expect(204);
}

async function guestQuote(): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(QUOTE).expect(200));
}

async function proQuote(): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.asSub(PRO_SUB).post("/shop/quote/mine").send(QUOTE).expect(200),
  );
}

/** Un pro actif, au compte : une commande au compte se révise (M1). */
async function seedPro(): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: PRO_SUB });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  await staff().post("/admin/delivery-zones").send(ZONE).expect(201);
  return company.id;
}

/** Un pro ne livre qu'à une heure INSCRITE sur son adresse (2026-10-12). */
async function proAddress(companyId: string): Promise<string> {
  const created = await ctx
    .asSub(PRO_SUB)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send({
      ...COURIER_ADDR,
      label: "Hôtel",
      isDefault: true,
      specs: {
        signatureRequired: null,
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

function orderBody(addressId: string, extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    settlement: "account",
    deliveryAddressId: addressId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "delivery",
    requestedWindow: { start: null, end: "10:00" },
    deliveryAddress: COURIER_ADDR,
    note: "",
    lines: LINES(10),
    ...extra,
  };
}

async function placePro(addressId: string): Promise<string> {
  const placed = await ctx.asSub(PRO_SUB).post("/orders").send(orderBody(addressId)).expect(201);
  return jsonBody<PlacedOrderResponse>(placed).id;
}

async function revise(orderId: string, addressId: string, revision: number, quantity: number) {
  await ctx
    .asSub(PRO_SUB)
    .post(`/orders/${orderId}/revisions`)
    .send({
      expectedRevision: revision,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      deliveryAddressId: addressId,
      deliveryAddress: COURIER_ADDR,
      requestedWindow: { start: null, end: "10:00" },
      note: "",
      lines: LINES(quantity),
    })
    .expect(200);
  return ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

describe("le franco au devis", () => {
  /** Régression : sans seuil réglé, le devis livré est celui d'avant le franco. */
  it("sans seuil : la course est facturée, comme avant", async () => {
    await staff().post("/admin/delivery-zones").send(ZONE).expect(201);

    const view = await guestQuote();
    expect(view.deliveryFeeCents).toBe(2_000);
    expect(view).not.toHaveProperty("freeDelivery");
  });

  it("particulier : offerte au seuil HT pile, facturée un centime en dessous", async () => {
    await staff().post("/admin/delivery-zones").send(ZONE).expect(201);
    const base = await guestQuote();

    await setGlobal({ b2c: { freeDeliveryThresholdCents: base.subtotalHtCents } });
    const reached = await guestQuote();
    expect(reached.deliveryFeeCents).toBe(0);
    // 1c : « Coursier offert », sans montant (Hugo, 2026-11-05).
    expect(reached.freeDelivery).toEqual({ status: "offered" });
    // La course disparaît avec sa TVA : 20,00 € HT à 20 % (port standard).
    expect(reached.totalCents).toBe(base.totalCents - 2_400);

    await setGlobal({ b2c: { freeDeliveryThresholdCents: base.subtotalHtCents + 1 } });
    const short = await guestQuote();
    expect(short.deliveryFeeCents).toBe(2_000);
    // 1c : le manque, HT comme le seuil, servi par le serveur.
    expect(short.freeDelivery).toMatchObject({ status: "short", remainingCents: 1 });
    // Le particulier lit aussi le manque en TTC « environ », arrondi au-dessus
    // (Hugo, 2026-11-05) : jamais moins que le manque HT.
    const remainingTtc =
      short.freeDelivery?.status === "short" ? short.freeDelivery.remainingTtcCents : undefined;
    expect(remainingTtc).toBeGreaterThanOrEqual(1);
  });

  it("pro (/mine) : le manque HT avant le seuil, puis offert", async () => {
    await seedPro();
    const base = await proQuote();
    expect(base).not.toHaveProperty("freeDelivery");

    await setGlobal({ b2b: { freeDeliveryThresholdCents: base.subtotalHtCents + 1_200 } });
    // `toEqual` : pas de `remainingTtcCents` pour un pro (line_ht).
    expect((await proQuote()).freeDelivery).toEqual({ status: "short", remainingCents: 1_200 });

    await setGlobal({ b2b: { freeDeliveryThresholdCents: base.subtotalHtCents } });
    const reached = await proQuote();
    expect(reached.freeDelivery).toEqual({ status: "offered" });
    expect(reached.deliveryFeeCents).toBe(0);
  });

  it("le seuil d'une zone remplace le global, pour son audience", async () => {
    await staff()
      .post("/admin/delivery-zones")
      .send({
        ...ZONE,
        audienceTerms: {
          b2b: { fee: null, freeDeliveryThresholdCents: null },
          b2c: { fee: null, freeDeliveryThresholdCents: 1_000_000 },
        },
      })
      .expect(201);
    await setGlobal({ b2c: { freeDeliveryThresholdCents: 0 } });

    expect((await guestQuote()).deliveryFeeCents).toBe(2_000);
  });
});

describe("le franco d'un pro, de la passation à la révision", () => {
  it("figé à la passation, rejugé contre le seuil figé, perdu sous le seuil", async () => {
    const companyId = await seedPro();
    const addressId = await proAddress(companyId);
    await setGlobal({ b2b: { fee: PRO_FEE } });
    const base = (await proQuote()).subtotalHtCents;
    await setGlobal({ b2b: { freeDeliveryThresholdCents: base } });
    expect((await proQuote()).deliveryFeeCents).toBe(0);

    const orderId = await placePro(addressId);
    const placed = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(placed).toMatchObject({
      deliveryFeeCents: 0,
      deliveryFeeAdjustment: PRO_FEE,
      freeDeliveryThresholdCents: base,
      freeDeliveryWaivedCents: 900,
      freeDeliveryWaivedTtcCents: null,
    });

    // Le réglage du jour monte : la révision ne le lit pas, elle garde le seuil figé.
    await setGlobal({ b2b: { freeDeliveryThresholdCents: 1_000_000 } });
    const above = await revise(orderId, addressId, 0, 12);
    expect(above).toMatchObject({ deliveryFeeCents: 0, freeDeliveryThresholdCents: base });

    // Repassé sous le seuil figé : la course revient, au barème figé.
    const below = await revise(orderId, addressId, 1, 5);
    expect(below).toMatchObject({
      deliveryFeeCents: 900,
      deliveryFeeAdjustment: PRO_FEE,
      freeDeliveryThresholdCents: null,
      freeDeliveryWaivedCents: null,
    });
    expect(below.totalCents).toBeGreaterThan(0);
  });

  it("un seuil perdu entre le devis et la commande : 409 total changé, rien d'écrit", async () => {
    const companyId = await seedPro();
    const addressId = await proAddress(companyId);
    await setGlobal({ b2b: { fee: PRO_FEE } });
    const base = (await proQuote()).subtotalHtCents;
    await setGlobal({ b2b: { freeDeliveryThresholdCents: base } });
    const seen = await proQuote();
    expect(seen.deliveryFeeCents).toBe(0);

    await setGlobal({ b2b: { freeDeliveryThresholdCents: base + 1 } });
    const refused = await ctx
      .asSub(PRO_SUB)
      .post("/orders")
      .send(orderBody(addressId, { expectedTotalCents: seen.totalCents }))
      .expect(409);

    const body = refused.body as { code: string; totalCents: number };
    expect(body.code).toBe(ORDER_TOTAL_CHANGED);
    expect(body.totalCents).toBeGreaterThan(seen.totalCents);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});
