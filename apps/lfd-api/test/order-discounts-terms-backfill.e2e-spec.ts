/**
 * E2E de la **reprise des termes figés des remises** —
 * `documentation/promotions/plan-remises-acquises.md`, § 10.3.
 *
 * Ce que seul le vrai SQL prouve : une remise active posée « avant » la
 * migration (termes à `NULL`) reçoit les termes de sa promotion — archivée
 * comprise — marqués `backfilled` ; à blanc, rien n'est écrit ; une seconde
 * passe ne trouve plus rien ; et le CHECK refuse des termes à moitié figés.
 */
import type { AdminPlacedOrderResponse, CreatedPickupResponse } from "@lfd/contracts";

import { PrismaOrderDiscountTermsBackfill } from "../src/b2b/orders/infrastructure/prisma-order-discount-terms-backfill.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
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
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const BUYER = "auth0|reprise-termes";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_terms", clientSecret: "pi_terms_s" }),
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

/** Les colonnes d'une remise d'avant la migration : termes inconnus. */
const UNKNOWN_TERMS = {
  cumulative: null,
  minQuantity: null,
  fulfillmentPickup: null,
  fulfillmentDelivery: null,
  fulfillmentPickupPoints: [],
  fulfillmentDeliveryZones: [],
  frozenTermsOrigin: null,
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

/**
 * Une commande remisée par « −10 % dès 10 au Labo », dont la remise a perdu
 * ses termes (comme avant la migration) et dont la promotion est archivée.
 */
async function placedBeforeTerms(): Promise<{
  readonly orderId: string;
  readonly labo: string;
}> {
  const labo = jsonBody<CreatedPickupResponse>(
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
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  const promotionId = await posePromotion(
    staff(),
    promotionTerms({
      effect: { kind: "percent_off", value: 1_000 },
      validFrom: daysAgo(1),
      fulfillment: { kind: "basket", pickup: { points: [labo] }, delivery: "none" },
      conditions: [{ kind: "min_quantity", value: 10 }],
    }),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
  const orderId = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        requestedDeliveryDate: serviceDay(7),
        fulfillmentMethod: "pickup",
        pickupAddressId: labo,
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 10 }],
      })
      .expect(201),
  ).id;
  await ctx.prisma.orderDiscount.updateMany({ where: { orderId }, data: UNKNOWN_TERMS });
  await staff()
    .post(`/admin/promotions/${promotionId}/archive`)
    .send({ reason: "Fin de l'opération" })
    .expect(204);
  return { orderId, labo };
}

function termsOf(orderId: string) {
  return ctx.prisma.orderDiscount.findMany({
    where: { orderId, archivedAt: null },
    select: {
      frozenTermsOrigin: true,
      cumulative: true,
      minQuantity: true,
      fulfillmentPickup: true,
      fulfillmentPickupPoints: true,
      fulfillmentDelivery: true,
    },
  });
}

async function pass(write: boolean) {
  const backfill = new PrismaOrderDiscountTermsBackfill(ctx.prisma);
  const lines = [];
  for (const id of await backfill.pendingDiscountIds()) {
    lines.push(await backfill.fill(id, write));
  }
  return lines;
}

describe("la reprise des termes figés des remises (§ 10.3)", () => {
  it("à blanc : le verdict, rien d'écrit", async () => {
    const { orderId } = await placedBeforeTerms();

    const lines = await pass(false);

    expect(lines.map((line) => line.outcome)).toEqual([{ kind: "backfilled" }]);
    expect(await termsOf(orderId)).toEqual([expect.objectContaining({ frozenTermsOrigin: null })]);
  });

  it("déduit les termes de la promotion, archivée comprise, marqués « backfilled »", async () => {
    const { orderId, labo } = await placedBeforeTerms();

    await pass(true);

    expect(await termsOf(orderId)).toEqual([
      {
        frozenTermsOrigin: "backfilled",
        cumulative: false,
        minQuantity: 10,
        fulfillmentPickup: "listed",
        fulfillmentPickupPoints: [labo],
        fulfillmentDelivery: "none",
      },
    ]);
  });

  it("une seconde passe ne trouve plus rien", async () => {
    await placedBeforeTerms();
    await pass(true);

    expect(await pass(true)).toEqual([]);
  });

  it("le CHECK refuse des termes à moitié figés", async () => {
    const { orderId } = await placedBeforeTerms();

    await expect(
      ctx.prisma.orderDiscount.updateMany({
        where: { orderId },
        data: { frozenTermsOrigin: "backfilled" },
      }),
    ).rejects.toThrow(/order_discounts_terms_together/u);
  });
});
