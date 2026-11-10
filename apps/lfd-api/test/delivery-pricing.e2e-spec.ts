/**
 * E2E du **réglage global de livraison par audience** et des remplacements par
 * zone (plan `documentation/promotions/plan-livraison-offerte.md`, sous-lot
 * 0a) : lecture et écriture staff, ligne absente = rien de réglé, auteur figé,
 * refus nommés, colonnes de zone nulles.
 *
 * Depuis 0b, le frais facturé se RÉSOUT par audience : remplacement de la
 * zone, sinon réglage global, sinon l'ancien frais de la zone — au devis comme
 * à la passation, avec la clientèle que le serveur attribue (pending = pro).
 */
import { randomUUID } from "node:crypto";

import {
  DEFAULT_DELIVERY_PRICING,
  type AdminDeliveryZoneView,
  type AudienceDeliveryZoneView,
  type CreatedDeliveryZoneResponse,
  type DeliveryPricingView,
  type PlacedOrderResponse,
  type ShopQuoteView,
} from "@lfd/contracts";

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

const fakeGateway = cardGatewayDouble("pi_delivery_pricing");

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

const ZONE_FEE_CENTS = 2_000;
const ZONE = {
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: ZONE_FEE_CENTS },
};
const DELIVERY_QUOTE = {
  lines: [{ sku: "VIE-001-1", quantity: 10 }],
  fulfillment: { method: "delivery", codePostal: "73150" },
};
const GLOBAL = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: "percent", bp: 1_000 }, freeDeliveryThresholdCents: 1 },
};

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function adminView(): Promise<DeliveryPricingView> {
  return jsonBody<DeliveryPricingView>(await staff().get("/admin/delivery-pricing").expect(200));
}

async function createZone(body: Record<string, unknown> = ZONE): Promise<string> {
  const response = await staff().post("/admin/delivery-zones").send(body).expect(201);
  return jsonBody<CreatedDeliveryZoneResponse>(response).id;
}

async function zoneOverrides(id: string): Promise<readonly (number | string | null)[]> {
  const row = await ctx.prisma.deliveryZone.findUniqueOrThrow({ where: { id } });
  return [
    row.b2bFeeMode,
    row.b2bFeeValue,
    row.b2bFreeDeliveryThresholdCents,
    row.b2cFeeMode,
    row.b2cFeeValue,
    row.b2cFreeDeliveryThresholdCents,
  ];
}

async function quotedDeliveryFee(): Promise<number> {
  const response = await ctx.http().post("/shop/quote").send(DELIVERY_QUOTE).expect(200);
  return jsonBody<ShopQuoteView>(response).deliveryFeeCents;
}

describe("le réglage global de livraison", () => {
  it("ligne absente : rien de réglé, sans auteur ni instant", async () => {
    expect(await adminView()).toEqual(DEFAULT_DELIVERY_PRICING);
    expect(await ctx.prisma.deliveryPricing.count()).toBe(0);
  });

  it("pose les deux audiences, puis n'en change qu'une valeur, et fige qui et quand", async () => {
    await staff().patch("/admin/delivery-pricing").send(GLOBAL).expect(204);
    await staff()
      .patch("/admin/delivery-pricing")
      .send({ b2c: { freeDeliveryThresholdCents: null } })
      .expect(204);

    const view = await adminView();
    expect(view.b2b).toEqual(GLOBAL.b2b);
    expect(view.b2c).toEqual({ fee: GLOBAL.b2c.fee, freeDeliveryThresholdCents: null });
    expect(view.updatedAt).not.toBeNull();
    expect(view.updatedBy).not.toBeNull();
  });

  it("refuse un franco négatif (400 nommé) et un patch vide (400), sans rien écrire", async () => {
    const refused = await staff()
      .patch("/admin/delivery-pricing")
      .send({ b2b: { freeDeliveryThresholdCents: -1 } })
      .expect(400);
    expect((refused.body as { code?: string }).code).toBe(
      "delivery_pricing.invalid_free_delivery_threshold",
    );
    await staff().patch("/admin/delivery-pricing").send({}).expect(400);

    expect(await ctx.prisma.deliveryPricing.count()).toBe(0);
  });

  it("n'est pas servi sans jeton", async () => {
    await ctx.http().get("/admin/delivery-pricing").expect(401);
  });
});

describe("les remplacements par zone", () => {
  it("une zone créée sans eux les a nuls, et la route publique ne les sert pas", async () => {
    const id = await createZone();

    expect(await zoneOverrides(id)).toEqual([null, null, null, null, null, null]);
    const zones = jsonBody<AudienceDeliveryZoneView[]>(
      await ctx.http().get("/delivery-zones").expect(200),
    );
    expect(zones).toEqual([
      {
        id,
        label: ZONE.label,
        postalPrefixes: ZONE.postalPrefixes,
        audience: "b2c",
        fee: ZONE.fee,
        freeDeliveryThresholdCents: null,
      },
    ]);
  });

  it("posés à la création ; une modification qui ne les dit pas n'y touche pas", async () => {
    const id = await createZone({
      ...ZONE,
      audienceTerms: {
        b2b: { fee: { mode: "amount", cents: 300 }, freeDeliveryThresholdCents: 4_000 },
        b2c: { fee: null, freeDeliveryThresholdCents: null },
      },
    });
    await staff()
      .patch(`/admin/delivery-zones/${id}`)
      .send({ ...ZONE, label: "Tignes" })
      .expect(204);

    expect(await zoneOverrides(id)).toEqual(["amount", 300, 4_000, null, null, null]);
  });

  it("refuse un remplacement invalide (400), sans créer la zone", async () => {
    await staff()
      .post("/admin/delivery-zones")
      .send({
        ...ZONE,
        audienceTerms: {
          b2b: { fee: null, freeDeliveryThresholdCents: -5 },
          b2c: { fee: null, freeDeliveryThresholdCents: null },
        },
      })
      .expect(400);

    expect(await ctx.prisma.deliveryZone.count()).toBe(0);
  });
});

describe("le frais facturé, résolu par audience (0b)", () => {
  const PENDING = "auth0|livraison-en-attente";
  const ACTIVE = "auth0|livraison-active";
  const SERVICE_DAY = serviceDay();
  const AMOUNTS = {
    b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: null },
    b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: null },
  };
  const COURIER_ADDR = {
    label: "",
    ligne1: "12 rue du Test",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
  };

  async function seedPros(): Promise<string> {
    const pending = await createUser(ctx.prisma, { auth0Sub: PENDING });
    const pendingCompany = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    await attachTo(ctx.prisma, pending.id, pendingCompany.id, CustomerRole.owner);
    const active = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
    const activeCompany = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await attachTo(ctx.prisma, active.id, activeCompany.id, CustomerRole.owner);
    return activeCompany.id;
  }

  async function quotedFor(sub: string): Promise<number> {
    const response = await ctx.asSub(sub).post("/shop/quote/mine").send(DELIVERY_QUOTE).expect(200);
    return jsonBody<ShopQuoteView>(response).deliveryFeeCents;
  }

  /** Un pro ne livre qu'à une heure INSCRITE sur son adresse (2026-10-12). */
  async function placeProDelivery(companyId: string): Promise<number | null> {
    return (await placedProDelivery(companyId)).deliveryFeeCents;
  }

  async function placedProDelivery(companyId: string): Promise<{
    readonly orderId: string;
    readonly addressId: string;
    readonly deliveryFeeCents: number;
  }> {
    const created = await ctx
      .asSub(ACTIVE)
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
    const placed = await ctx
      .asSub(ACTIVE)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        deliveryAddressId: jsonBody<{ id: string }>(created).id,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        requestedWindow: { start: null, end: "10:00" },
        deliveryAddress: COURIER_ADDR,
        note: "",
        lines: DELIVERY_QUOTE.lines,
      })
      .expect(201);
    const orderId = jsonBody<PlacedOrderResponse>(placed).id;
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    return {
      orderId,
      addressId: jsonBody<{ id: string }>(created).id,
      deliveryFeeCents: row.deliveryFeeCents,
    };
  }

  /**
   * Régression attendue : sans réglage global ni remplacement, un devis livré
   * coûte EXACTEMENT l'ancien frais de la zone — le 0b ne change aucun prix
   * tant que personne n'a rien saisi.
   */
  it("sans aucun réglage : l'ancien frais de la zone, pour un particulier comme pour un pro", async () => {
    await seedPros();
    await createZone();

    expect(await quotedDeliveryFee()).toBe(ZONE_FEE_CENTS);
    expect(await quotedFor(ACTIVE)).toBe(ZONE_FEE_CENTS);
  });

  it("le réglage global : chaque audience son frais, la société en attente au frais des pros", async () => {
    const activeCompanyId = await seedPros();
    await createZone();
    await staff().patch("/admin/delivery-pricing").send(AMOUNTS).expect(204);

    expect(await quotedDeliveryFee()).toBe(1_500);
    expect(await quotedFor(PENDING)).toBe(900);
    expect(await quotedFor(ACTIVE)).toBe(900);
    // La passation facture ce que le devis annonce.
    expect(await placeProDelivery(activeCompanyId)).toBe(900);
  });

  /**
   * Régression (1a, Hugo, 2026-11-05) : la révision re-résolvait le barème au
   * réglage du jour, si bien qu'un frais global relevé APRÈS la passation
   * renchérissait la commande qu'on modifiait. Elle garde le tarif figé.
   */
  it("la révision garde le frais de la passation quand le réglage global change ensuite", async () => {
    const companyId = await seedPros();
    // Au compte : une commande réglée par carte ne se modifie pas (M1).
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    await createZone();
    await staff().patch("/admin/delivery-pricing").send(AMOUNTS).expect(204);
    const placed = await placedProDelivery(companyId);
    expect(placed.deliveryFeeCents).toBe(900);

    await staff()
      .patch("/admin/delivery-pricing")
      .send({ b2b: { fee: { mode: "amount", cents: 3_000 } } })
      .expect(204);
    await ctx
      .asSub(ACTIVE)
      .post(`/orders/${placed.orderId}/revisions`)
      .send({
        expectedRevision: 0,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddressId: placed.addressId,
        deliveryAddress: COURIER_ADDR,
        requestedWindow: { start: null, end: "10:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 12 }],
      })
      .expect(200);

    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(after.revision).toBe(1);
    expect(after.deliveryFeeCents).toBe(900);
    expect(after.deliveryFeeAdjustment).toEqual({ mode: "amount", cents: 900 });
    // Le tarif du jour, lui, a bien changé : une nouvelle commande le paie.
    expect(await quotedFor(ACTIVE)).toBe(3_000);
  });

  it("le remplacement de la zone l'emporte, pour son audience seule ; revenir au global le défait", async () => {
    await seedPros();
    const id = await createZone();
    await staff().patch("/admin/delivery-pricing").send(AMOUNTS).expect(204);
    const farther = {
      b2b: { fee: null, freeDeliveryThresholdCents: null },
      b2c: { fee: { mode: "amount", cents: 2_500 }, freeDeliveryThresholdCents: null },
    };
    await staff()
      .patch(`/admin/delivery-zones/${id}`)
      .send({ ...ZONE, audienceTerms: farther })
      .expect(204);

    expect(await quotedDeliveryFee()).toBe(2_500);
    expect(await quotedFor(ACTIVE)).toBe(900);

    await staff()
      .patch(`/admin/delivery-zones/${id}`)
      .send({
        ...ZONE,
        audienceTerms: { b2b: farther.b2b, b2c: { fee: null, freeDeliveryThresholdCents: null } },
      })
      .expect(204);
    expect(await quotedDeliveryFee()).toBe(1_500);
  });

  it("la vue admin des zones porte les remplacements ; la route publique ne les sert pas", async () => {
    const id = await createZone({ ...ZONE, audienceTerms: AMOUNTS });

    const admin = jsonBody<AdminDeliveryZoneView[]>(
      await staff().get("/admin/delivery-zones").expect(200),
    );
    expect(admin).toEqual([
      {
        id,
        label: ZONE.label,
        postalPrefixes: ZONE.postalPrefixes,
        fee: ZONE.fee,
        audienceTerms: AMOUNTS,
      },
    ]);
    const zones = jsonBody<AudienceDeliveryZoneView[]>(
      await ctx.http().get("/delivery-zones").expect(200),
    );
    expect(zones[0]).not.toHaveProperty("audienceTerms");
    await ctx.http().get("/admin/delivery-zones").expect(401);
  });

  it("le réglage global part au journal, avec l'état remplacé", async () => {
    await staff().patch("/admin/delivery-pricing").send(AMOUNTS).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_pricing.updated" },
    });
    expect(facts).toHaveLength(1);
  });
});
