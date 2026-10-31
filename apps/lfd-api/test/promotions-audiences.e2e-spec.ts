/**
 * E2E du **public à plusieurs cibles et des libellés par audience** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 15, lot L8b), sur le vrai Postgres.
 *
 * Au point PANIER — le seul où `buyerKind` est connu à la passation (§ 15.10,
 * S5) :
 *
 * 1. une promotion `{particuliers inscrits, pros}` rend, à un inscrit et à un
 *    pro actif, la MÊME remise et le MÊME total qu'une paire de jumelles ; un
 *    invité n'est pas touché ;
 * 2. chaque commande FIGE le libellé de son audience (`orders.discount_label`)
 *    et le bon de commande le lit ; une commande sans libellé figé garde
 *    « Remise retrait <point> » ;
 * 3. l'annonce d'un point porte le libellé de chaque clientèle.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import { randomUUID } from "node:crypto";

import type {
  CreatedPickupResponse,
  PickupAddressView,
  PlacedOrderResponse,
  PromotionTermsPayload,
} from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { pdfText } from "../src/b2b/orders/domain/services/__tests__/pdf-text.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const REGISTERED = "auth0|l8b-inscrit";
const PRO = "auth0|l8b-pro-actif";
const SERVICE_DAY = serviceDay();

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_l8b_${String(intentCounter)}`,
      clientSecret: `pi_l8b_${String(intentCounter)}_secret`,
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

const LINES = [
  { sku: "VIE-001-1", quantity: 8 },
  { sku: "PAI-001-1", quantity: 4 },
];

const INDIVIDUALS_LABEL = { fr: "Merci d'être inscrit", en: "Thanks for joining", it: null };
const PROS_LABEL = { fr: "Offre de la maison", en: null, it: null };

/** Le décor : un point, un inscrit, un pro actif au compte — puis la bascule. */
async function scene(): Promise<string> {
  await createUser(ctx.prisma, { auth0Sub: REGISTERED });
  const pro = await createUser(ctx.prisma, { auth0Sub: PRO });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, pro.id, company.id, CustomerRole.owner);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return site;
}

function promotion(site: string, over: Partial<PromotionTermsPayload>): Record<string, unknown> {
  return {
    internalName: "Retrait d'automne",
    label: { fr: "Remise d'automne", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 1_000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    validFrom: daysAgo(1),
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "pickup_point", pickupId: site },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

async function pose(site: string, over: Partial<PromotionTermsPayload>): Promise<void> {
  await staff().post(`/admin/sites/${site}/promotions`).send(promotion(site, over)).expect(201);
}

function order(site: string): Record<string, unknown> {
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

async function placeAs(sub: string, site: string): Promise<string> {
  return jsonBody<PlacedOrderResponse>(
    await ctx.asSub(sub).post("/orders").send(order(site)).expect(201),
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

/** Ce que la passation a FIGÉ. */
async function frozen(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { discountCents: true, totalCents: true, discountLabel: true },
  });
}

/** Les trois acheteurs, dans l'ordre : inscrit, pro actif, invité. */
async function threeOrders(site: string) {
  return {
    registered: await frozen(await placeAs(REGISTERED, site)),
    pro: await frozen(await placeAs(PRO, site)),
    guest: await frozen(await placeAsGuest(site)),
  };
}

async function bonText(sub: string, orderId: string): Promise<string> {
  const response = await ctx
    .asSub(sub)
    .get(`/orders/${orderId}/bon.pdf`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return pdfText(response.body as Buffer);
}

describe("une promotion, deux publics — au point panier (L8b)", () => {
  it("rend la même remise et le même total qu'une paire de jumelles ; l'invité n'est pas touché", async () => {
    const site = await scene();
    await pose(site, {
      audiences: [
        { kind: "individuals_registered", companyId: null },
        { kind: "pros", companyId: null },
      ],
    });
    const single = await threeOrders(site);

    await ctx.reset();
    ctx.app.get(PricingMaterialsCache).invalidate();
    const twinsSite = await scene();
    await pose(twinsSite, {
      internalName: "Jumelle inscrits",
      audiences: [{ kind: "individuals_registered", companyId: null }],
    });
    await pose(twinsSite, {
      internalName: "Jumelle pros",
      audiences: [{ kind: "pros", companyId: null }],
    });
    const twins = await threeOrders(twinsSite);

    expect(single.registered.discountCents).toBeGreaterThan(0);
    expect(single.pro.discountCents).toBeGreaterThan(0);
    for (const buyer of ["registered", "pro", "guest"] as const) {
      expect({
        discountCents: single[buyer].discountCents,
        totalCents: single[buyer].totalCents,
      }).toEqual({
        discountCents: twins[buyer].discountCents,
        totalCents: twins[buyer].totalCents,
      });
    }
    expect(single.guest.discountCents).toBe(0);
    expect(single.guest.discountLabel).toBeNull();
  });

  it("fige le libellé de l'audience de chacun, et le bon de commande le lit", async () => {
    const site = await scene();
    await pose(site, {
      audiences: [
        { kind: "individuals_registered", companyId: null },
        { kind: "pros", companyId: null },
      ],
      audienceLabels: { individuals: INDIVIDUALS_LABEL, pros: PROS_LABEL },
    });
    const registeredId = await placeAs(REGISTERED, site);
    const proId = await placeAs(PRO, site);

    expect((await frozen(registeredId)).discountLabel).toEqual({
      fr: "Merci d'être inscrit",
      en: "Thanks for joining",
      it: "Merci d'être inscrit",
    });
    expect((await frozen(proId)).discountLabel).toEqual({
      fr: "Offre de la maison",
      en: "Offre de la maison",
      it: "Offre de la maison",
    });

    // Le libellé est FIGÉ : la promotion modifiée ensuite ne le change pas.
    await ctx.prisma.promotion.updateMany({ data: { labelIndividualsFr: "Autre chose" } });
    expect(await bonText(REGISTERED, registeredId)).toContain("Merci d'être inscrit (10 %)");
    expect(await bonText(PRO, proId)).toContain("Offre de la maison (10 %)");
  });

  it("une promotion sans libellé d'audience fige le commun ; une commande d'avant garde le point", async () => {
    const site = await scene();
    await pose(site, { audiences: [{ kind: "individuals_registered", companyId: null }] });
    const placed = await placeAs(REGISTERED, site);
    expect((await frozen(placed)).discountLabel).toEqual({
      fr: "Remise d'automne",
      en: "Remise d'automne",
      it: "Remise d'automne",
    });

    // Une commande d'avant L8b : aucun libellé figé.
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE public.orders SET discount_label = NULL WHERE id = '${placed}'`,
    );
    expect(await bonText(REGISTERED, placed)).toContain("Remise retrait Le Labo (10 %)");
  });
});

describe("l'annonce d'un point, par clientèle (L8b)", () => {
  it("porte le libellé Pros aux pros et le libellé Particuliers aux particuliers", async () => {
    const site = await scene();
    await pose(site, {
      audiences: [{ kind: "everyone", companyId: null }],
      audienceLabels: { individuals: INDIVIDUALS_LABEL, pros: PROS_LABEL },
    });
    const listed = async (path: string) =>
      jsonBody<readonly PickupAddressView[]>(await ctx.http().get(path).expect(200)).find(
        (point) => point.id === site,
      )?.discounts;
    expect((await listed("/pickup-addresses"))?.b2c?.label).toEqual({
      fr: "Merci d'être inscrit",
      en: "Thanks for joining",
      it: "Merci d'être inscrit",
    });
    expect((await listed("/pickup-addresses?audience=pro"))?.b2b?.label?.fr).toBe(
      "Offre de la maison",
    );
  });
});
