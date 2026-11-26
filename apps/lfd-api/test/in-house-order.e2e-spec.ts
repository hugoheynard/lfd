/**
 * E2E de la **commande interne** d'un de nos restaurants — un payeur marqué
 * « maison » (`documentation/comptabilite/facturation/plan-restaurants-maison.md`,
 * L2). Par chacune des quatre portes : l'espace client, la saisie de l'équipe,
 * l'échéance d'un panier récurrent et la transformation d'un reliquat.
 *
 * Ce que seul le vrai SQL prouve, dans chaque cas :
 * - la commande s'écrit à total nul, `offer_nature = 'in_house'` (le CHECK
 *   élargi l'admet), sa valeur gardée ;
 * - elle sort de l'assiette de la facture du mois (`accountOrderWhere`) et du
 *   chiffre d'affaires (`revenueWhere`) ;
 * - la carte (ou le lien) est refusée par son nom ;
 * - le restaurant l'annule tard — la veille, sous un délai client actif —,
 *   sans engagement au compte à fermer ;
 * - aucun fait `order.offered` : personne ne l'a offerte.
 *
 * Et un payeur démarqué recommande au compte, facturé.
 *
 * Une frontière doublée : la signature du jeton staff.
 */
import { WORKSPACE_HEADER } from "@lfd/contracts";

import { accountOrderWhere } from "../src/lafoliecoffee/accounting/infrastructure/billable-order-criterion.js";
import { revenueWhere } from "../src/lafoliecoffee/growth/infrastructure/revenue.where.js";
import {
  InHouseBuyerCardRefusedError,
  InHouseBuyerLinkRefusedError,
} from "../src/lafoliecoffee/orders/domain/errors/in-house-buyer-errors.js";
import { OccurrencePlacement } from "../src/recurring/channels/commerce/index.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import {
  backorderDecor,
  conversionBody,
  convertBackorder,
  openBackorder,
  placeOrigin,
  staff,
  SKU,
  type BackorderDecor,
} from "./backorder-conversion-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeOrder, placeOrderForCustomer } from "./order-factory.js";
import { publishSalesTerms } from "./recurring-scene.js";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const BUYER_SUB = "auth0|restaurant-maison";
const LINES = [{ sku: SKU, quantity: 4 }] as const;

let ctx: E2eContext;
let decor: BackorderDecor;
let buyerSub = BUYER_SUB;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Un point, un pro actif au compte et ses adresses : le décor du reliquat
  // sert aussi aux trois autres portes.
  decor = await backorderDecor(ctx);
  const buyer = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: decor.buyerId },
    select: { auth0Sub: true },
  });
  buyerSub = buyer.auth0Sub ?? BUYER_SUB;
  await markInHouse(decor.companyId, true);
});

/** Le geste de la fiche client, par la vraie route. */
async function markInHouse(companyId: string, inHouse: boolean): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${companyId}/in-house`)
    .set(INTENT_KEY, freshIntent())
    .send({ inHouse })
    .expect(204);
}

/** La commande, telle qu'elle est écrite. */
function row(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      totalCents: true,
      offerNature: true,
      offeredTotalCents: true,
      offerNotifiesCustomer: true,
      paymentStatus: true,
      status: true,
    },
  });
}

/** Total nul, nature `in_house`, valeur gardée ; hors assiette, hors CA, sans fait d'offre. */
async function expectInternal(orderId: string): Promise<void> {
  const written = await row(orderId);
  expect(written).toMatchObject({
    totalCents: 0,
    offerNature: "in_house",
    offerNotifiesCustomer: true,
    paymentStatus: "not_required",
  });
  expect(written.offeredTotalCents).toBeGreaterThan(0);
  expect(await ctx.prisma.order.count({ where: { id: orderId, ...accountOrderWhere() } })).toBe(0);
  expect(await ctx.prisma.order.count({ where: { id: orderId, ...revenueWhere() } })).toBe(0);
  expect(
    await ctx.prisma.outboxMessage.count({
      where: { type: "order.offered", key: `order.offered:${orderId}` },
    }),
  ).toBe(0);
}

/**
 * Le restaurant l'annule la veille, sous un délai client actif de 48 h : un
 * pro n'a pas de délai, et une commande interne n'a pas d'engagement au
 * compte à fermer.
 */
async function expectLateCancellationByRestaurant(orderId: string): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/customer-cancellation")
    .send({ delayEnabled: true, hoursBefore: 48 })
    .expect(204);

  await ctx.asSub(buyerSub).post(`/orders/${orderId}/cancel`).send({}).expect(204);

  expect((await row(orderId)).status).toBe("cancelled");
}

function pickup() {
  return { method: "pickup" as const, pickupSiteId: decor.pickupId };
}

describe("depuis l'espace client", () => {
  it("🔴 commande interne : total nul, hors facture, hors CA ; annulée tard par le restaurant", async () => {
    const placed = await placeOrder(ctx, {
      buyerUserId: decor.buyerId,
      companyId: decor.companyId,
      fulfillment: pickup(),
      forDay: serviceDay(1),
      lines: LINES,
    });

    await expectInternal(placed.id);
    expect(placed.paymentIntentId).toBeNull();
    await expectLateCancellationByRestaurant(placed.id);
  });

  it("🔴 la carte est refusée par son nom, rien n'est écrit", async () => {
    await expect(
      placeOrder(ctx, {
        buyerUserId: decor.buyerId,
        companyId: decor.companyId,
        fulfillment: pickup(),
        settlement: "card",
        lines: LINES,
      }),
    ).rejects.toBeInstanceOf(InHouseBuyerCardRefusedError);
    expect(await ctx.prisma.order.count({ where: { companyId: decor.companyId } })).toBe(0);
  });

  it("par la route : `in_house` rendu, et la boutique n'ouvre pas de règlement", async () => {
    const response = await ctx
      .asSub(buyerSub)
      .post("/orders")
      .set(WORKSPACE_HEADER, decor.companyId)
      .send({
        idempotencyKey: freshIntent(),
        salesTerms: null,
        settlement: "card",
        fulfillmentMethod: "pickup",
        pickupAddressId: decor.pickupId,
        deliveryAddress: null,
        deliveryAddressId: null,
        requestedDeliveryDate: serviceDay(7),
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: LINES,
        expectedTotalCents: 0,
      });

    expect(response.status).toBe(409);
    expect((response.body as { code?: string }).code).toBe(
      "orders.settlement.in_house_card_refused",
    );
  });
});

describe("par la saisie de l'équipe", () => {
  it("🔴 au compte sans crédit à juger : commande interne ; annulée tard par le restaurant", async () => {
    await ctx.prisma.company.update({
      where: { id: decor.companyId },
      data: { grantedTerms: [] },
    });

    const placed = await placeOrderForCustomer(ctx, {
      buyerUserId: decor.buyerId,
      companyId: decor.companyId,
      staffUserId: E2E_STAFF_ID,
      settlement: "account",
      fulfillment: pickup(),
      forDay: serviceDay(1),
      lines: LINES,
    });

    await expectInternal(placed.id);
    await expectLateCancellationByRestaurant(placed.id);
  });

  it("🔴 le lien de règlement est refusé par son nom", async () => {
    await expect(
      placeOrderForCustomer(ctx, {
        buyerUserId: decor.buyerId,
        companyId: decor.companyId,
        staffUserId: E2E_STAFF_ID,
        settlement: "link",
        fulfillment: pickup(),
        lines: LINES,
      }),
    ).rejects.toBeInstanceOf(InHouseBuyerLinkRefusedError);
  });

  it("🔴 « Commande interne » ne s'offre pas à la main : 400, rien d'écrit", async () => {
    const response = await staff(ctx)
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: decor.companyId,
        buyerUserId: decor.buyerId,
        settlement: "offered",
        offer: { nature: "in_house", note: "À la main", notifyCustomer: false },
        requestedDeliveryDate: serviceDay(7),
        note: "",
        lines: LINES,
        fulfillmentMethod: "pickup",
        pickupAddressId: decor.pickupId,
        deliveryAddressId: null,
        deliveryAddress: null,
        requestedWindow: { start: "07:00", end: "08:00" },
        expectedTotalCents: 0,
      });

    expect(response.status).toBe(400);
    expect((response.body as { code?: string }).code).toBe("orders.offer.in_house_not_grantable");
  });
});

describe("une commande interne modifiée", () => {
  it("🔴 reste interne, sa valeur suit, et aucun fait de réévaluation d'offre", async () => {
    const placed = await placeOrderForCustomer(ctx, {
      buyerUserId: decor.buyerId,
      companyId: decor.companyId,
      staffUserId: E2E_STAFF_ID,
      settlement: "account",
      fulfillment: pickup(),
      lines: LINES,
    });
    const before = await row(placed.id);
    const day = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { requestedDeliveryDate: true },
    });

    await staff(ctx)
      .post(`/admin/orders/${placed.id}/revisions`)
      .send({
        expectedRevision: 0,
        expectedTotalCents: 0,
        requestedDeliveryDate: day.requestedDeliveryDate?.toISOString().slice(0, 10),
        fulfillmentMethod: "pickup",
        pickupAddressId: decor.pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: SKU, quantity: 8 }],
      })
      .expect(200);

    const after = await row(placed.id);
    expect(after).toMatchObject({ totalCents: 0, offerNature: "in_house" });
    expect(after.offeredTotalCents).toBeGreaterThan(before.offeredTotalCents ?? 0);
    expect(
      await ctx.prisma.outboxMessage.count({
        where: { type: { in: ["order.offered", "order.offer_revalued"] } },
      }),
    ).toBe(0);
  });
});

describe("par un panier récurrent", () => {
  it("🔴 l'échéance passe en commande interne, sans crédit ; annulée tard par le restaurant", async () => {
    await publishSalesTerms(ctx);
    await ctx.prisma.company.update({
      where: { id: decor.companyId },
      data: { grantedTerms: [] },
    });

    const outcome = await ctx.app.get(OccurrencePlacement).place({
      basketId: "basket_maison",
      serviceDay: serviceDay(1),
      buyerUserId: decor.buyerId,
      companyId: decor.companyId,
      routing: {
        method: "pickup",
        deliveryAddress: null,
        pickupAddressId: decor.pickupId,
        window: { start: "07:00", end: "08:00" },
      },
      lines: [...LINES],
      note: "",
      deltas: { added: [], removed: [] },
      salesTerms: { key: "salesTermsPro", revision: 1, fileId: null },
    });

    expect(outcome.kind).toBe("placed");
    const order = await ctx.prisma.order.findFirstOrThrow({
      where: { fromSubscriptionId: "basket_maison" },
      select: { id: true },
    });
    await expectInternal(order.id);
    await expectLateCancellationByRestaurant(order.id);
  });
});

describe("par la transformation d'un reliquat", () => {
  async function backorder(): Promise<string> {
    // L'origine, passée avant le marquage : au compte, facturée comme prévu.
    await markInHouse(decor.companyId, false);
    const originId = await placeOrigin(ctx, decor, serviceDay(7), [{ sku: SKU, quantity: 10 }]);
    expect((await row(originId)).offerNature).toBeNull();
    await markInHouse(decor.companyId, true);
    return openBackorder(ctx, decor, originId, [{ quantity: 4, saleUnit: "piece" }]);
  }

  it("🔴 au compte, sans le droit d'offrir : commande interne ; annulée tard par le restaurant", async () => {
    const backorderId = await backorder();

    const converted = await convertBackorder(
      ctx,
      backorderId,
      conversionBody(decor, serviceDay(1)),
    );

    await expectInternal(converted.id);
    await expectLateCancellationByRestaurant(converted.id);
  });

  it("🔴 le lien de règlement est refusé par son nom", async () => {
    const backorderId = await backorder();

    const response = await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set(INTENT_KEY, freshIntent())
      .send({ ...conversionBody(decor, serviceDay(7)), settlement: "link", expectedTotalCents: 0 });

    expect(response.status).toBe(409);
    expect((response.body as { code?: string }).code).toBe(
      "orders.settlement.in_house_link_refused",
    );
  });
});

describe("un payeur démarqué", () => {
  it("🔴 recommande au compte : facturé, compté au CA", async () => {
    await markInHouse(decor.companyId, false);

    const placed = await placeOrder(ctx, {
      buyerUserId: decor.buyerId,
      companyId: decor.companyId,
      fulfillment: pickup(),
      settlement: "account",
      lines: LINES,
    });

    const written = await row(placed.id);
    expect(written.offerNature).toBeNull();
    expect(written.totalCents).toBeGreaterThan(0);
    expect(await ctx.prisma.order.count({ where: { id: placed.id, ...accountOrderWhere() } })).toBe(
      1,
    );
  });
});

/** Un second membre du restaurant commande aussi en interne : la nature est celle du payeur. */
describe("un autre membre du restaurant", () => {
  it("passe lui aussi une commande interne", async () => {
    const other = await createUser(ctx.prisma, { auth0Sub: "auth0|restaurant-maison-2" });
    await attachTo(ctx.prisma, other.id, decor.companyId, CustomerRole.orders);

    const placed = await placeOrder(ctx, {
      buyerUserId: other.id,
      companyId: decor.companyId,
      fulfillment: pickup(),
      lines: LINES,
    });

    expect((await row(placed.id)).offerNature).toBe("in_house");
  });
});
