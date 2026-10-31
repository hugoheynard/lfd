/**
 * E2E de **la reprise des remises face aux bons prévus** — `documentation/promotions/promotions.md`, § 2.12, décision du 2026-10-31 (lot M4).
 *
 * Régression : la reprise de M2 écrivait une part `delivery_note_discounts`
 * pour TOUT bon non annulé, prévu compris. Une révision archive ensuite la
 * remise de la commande et en écrit une neuve ; la part du bon prévu restait
 * citer la remise archivée — une part orpheline, que rien n'archivait. Un bon
 * ne reçoit désormais sa part qu'une fois parti, à la reprise comme au départ.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import { PrismaOrderDiscountBackfill } from "../src/b2b/orders/infrastructure/prisma-order-discount-backfill.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { Clock } from "../src/platform/time/clock.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { asPlacedBeforeM3 } from "./order-discount-fixtures.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-reprise-bons";

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_rb", clientSecret: "pi_rb_s" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

/** Un point remisé de 10 %, une société au compte, sa commande saisie par l'équipe. */
async function discountedOrder(): Promise<{ readonly orderId: string; readonly pickupId: string }> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  await poseSiteDiscount(staff(), point.id, {
    b2b: { mode: "percent", value: 1_000 },
    b2c: { mode: "percent", value: 1_000 },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "reprise-bons@test.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: company.id,
      buyerUserId: user.id,
      settlement: "account",
      ...content(point.id, 10),
    })
    .expect(201);
  return { orderId: jsonBody<AdminPlacedOrderResponse>(response).id, pickupId: point.id };
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function reopen(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/reopen`).expect(201);
  await ctx.drain();
}

const backfill = (): PrismaOrderDiscountBackfill =>
  new PrismaOrderDiscountBackfill(
    ctx.prisma,
    ctx.app.get(IdGenerator, { strict: false }),
    ctx.app.get(Clock, { strict: false }),
  );

describe("la reprise ne donne pas de part à un bon prévu", () => {
  it("commande reprise, bon prévu, révision : aucune part, donc aucune part orpheline", async () => {
    const { orderId, pickupId } = await discountedOrder();
    await closePlan();
    await asPlacedBeforeM3(ctx.prisma, orderId);

    expect(await backfill().recover(orderId, true)).toMatchObject({
      outcome: { kind: "computed" },
    });

    const [note] = await ctx.prisma.deliveryNote.findMany({ where: { orderId } });
    expect(note?.status).toBe("planned");
    expect(await ctx.prisma.deliveryNoteDiscount.count()).toBe(0);
    const recovered = await ctx.prisma.orderDiscount.findFirstOrThrow({
      where: { orderId, archivedAt: null },
    });

    await reopen();
    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, 4) })
      .expect(200);
    await closePlan();

    // La révision a archivé la remise reprise : une part du bon prévu l'aurait citée.
    const after = await ctx.prisma.orderDiscount.findUniqueOrThrow({ where: { id: recovered.id } });
    expect(after.archivedAt).not.toBeNull();
    expect(await ctx.prisma.deliveryNoteDiscount.count()).toBe(0);
  });
});
