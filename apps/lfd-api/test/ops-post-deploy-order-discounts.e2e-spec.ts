/**
 * E2E de l'opération après déploiement **« remises des commandes »** —
 * `documentation/ops/plan-operations-apres-deploiement.md`, § 7.1.
 *
 * Ce que seul ce niveau prouve : l'opération enveloppe la reprise des termes
 * figés sur le vrai SQL — simulée sans écriture, appliquée depuis la route,
 * rejouée sans rien changer. La reprise elle-même est éprouvée par
 * `order-discounts-terms-backfill.e2e-spec.ts` ; on en reprend la commande.
 *
 * Les dates sont relatives à maintenant (`daysAgo`, `serviceDay`).
 */
import type { AdminPlacedOrderResponse, CreatedPickupResponse } from "@lfd/contracts";
import type { PostDeployRunStarted, PostDeployRunView } from "@lfd/ops-contract";

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
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const ROUTE = "/admin/ops/post-deploy/order-discounts";
const BUYER = "auth0|operation-remises";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_op", clientSecret: "pi_op_s" }),
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

/** Une commande remisée au retrait dont la remise a perdu ses termes. */
async function placedBeforeTerms(): Promise<string> {
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
  await posePromotion(
    staff(),
    promotionTerms({
      effect: { kind: "percent_off", value: 1_000 },
      validFrom: daysAgo(1),
      fulfillment: { kind: "basket", pickup: { points: [labo] }, delivery: "none" },
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
  return orderId;
}

async function simulate(): Promise<PostDeployRunView> {
  const { runId } = jsonBody<PostDeployRunStarted>(
    await staff().post(`${ROUTE}/simulate`).expect(201),
  );
  return jsonBody<PostDeployRunView>(
    await staff().get(`/admin/ops/post-deploy/runs/${runId}`).expect(200),
  );
}

async function apply(): Promise<PostDeployRunView> {
  const { runId } = jsonBody<PostDeployRunStarted>(
    await staff().post(`${ROUTE}/apply`).send({ acknowledged: true }).expect(202),
  );
  await ctx.drain();
  return jsonBody<PostDeployRunView>(
    await staff().get(`/admin/ops/post-deploy/runs/${runId}`).expect(200),
  );
}

function originsOf(orderId: string) {
  return ctx.prisma.orderDiscount.findMany({
    where: { orderId, archivedAt: null },
    select: { frozenTermsOrigin: true },
  });
}

describe("l'opération « remises des commandes »", () => {
  it("simule sans écrire, applique les termes, puis ne trouve plus rien", async () => {
    const orderId = await placedBeforeTerms();

    expect((await simulate()).simulation.writable).toBe(1);
    expect(await originsOf(orderId)).toEqual([{ frozenTermsOrigin: null }]);

    expect(await apply()).toMatchObject({ state: "succeeded", progress: { writable: 1 } });
    expect(await originsOf(orderId)).toEqual([{ frozenTermsOrigin: "backfilled" }]);

    expect((await simulate()).simulation.writable).toBe(0);
    expect(await apply()).toMatchObject({ state: "succeeded", progress: { writable: 0 } });
    expect(await originsOf(orderId)).toEqual([{ frozenTermsOrigin: "backfilled" }]);
  });
});
