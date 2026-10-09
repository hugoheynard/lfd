/**
 * **Une commande carte n'existe qu'une fois réglée** (plan
 * `documentation/order/commande-carte-reglee.md`, §4.2–§4.4).
 *
 * Régression : en production le 2026-10-09, une commande « À régler » montrait
 * déjà son QR de retrait dans le suivi du client, et le comptoir l'aurait
 * remise — le jeton est émis à la passation, avant le paiement, et la règle de
 * retrait ne lisait pas le règlement.
 *
 * Ce que seul le vrai Postgres prouve : que le fait « réglée » traverse le
 * canal `handover/channels/commerce/` depuis la vraie colonne, et que la vue
 * client se taise sur le jeton jusqu'à la vraie confirmation de paiement.
 */
import { randomUUID } from "node:crypto";

import type { CustomerOrderView, HandoverQueueView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const CLIENT = "auth0|client-card-settled";
const DAY = serviceDay();
const UNSETTLED = /^Cette commande n'est pas réglée : /;

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_settled_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
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
  issuedIntents.splice(0);
  await createUser(ctx.prisma, { auth0Sub: CLIENT });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Passe une commande perso en retrait, carte NON réglée. */
async function placeUnpaid(): Promise<{ readonly id: string; readonly number: string }> {
  const point = await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } });
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(CLIENT)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: point.id,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201),
  );
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true, paymentStatus: true, handoverToken: true },
  });
  // Le décor : une carte en l'air, et un jeton DÉJÀ émis en base.
  expect(row.paymentStatus).toBe("pending");
  expect(row.handoverToken).not.toBeNull();
  return { id: row.id, number: placed.orderNumber };
}

async function clientView(id: string): Promise<CustomerOrderView> {
  return jsonBody<CustomerOrderView>(await ctx.asSub(CLIENT).get(`/orders/${id}`).expect(200));
}

async function queueIds(): Promise<readonly string[]> {
  const view = jsonBody<HandoverQueueView>(
    await staff().get(`/admin/handover/file?jour=${DAY}`).expect(200),
  );
  return view.entries.map((entry) => entry.orderId);
}

describe("une commande carte non réglée", () => {
  it("ne sert pas son jeton au client avant le paiement, et le sert après", async () => {
    const order = await placeUnpaid();

    expect((await clientView(order.id)).handoverToken).toBeNull();
    const mine = jsonBody<CustomerOrderView[]>(
      await ctx.asSub(CLIENT).get(`/orders/mine`).expect(200),
    );
    // Resserré le 2026-10-09 (Hugo) : une commande non réglée n'est même plus
    // listée — ni suivi, ni table.
    expect(mine.map((row) => row.id)).not.toContain(order.id);

    await settleCardPayments(ctx, issuedIntents);

    expect((await clientView(order.id)).handoverToken).not.toBeNull();
    const after = jsonBody<CustomerOrderView[]>(
      await ctx.asSub(CLIENT).get(`/orders/mine`).expect(200),
    );
    expect(after.map((row) => row.id)).toContain(order.id);
  });

  it("est refusée au comptoir en nommant le cas, puis remise une fois réglée", async () => {
    const order = await placeUnpaid();

    const refused = await staff().post(`/admin/handover/manual/${order.number}`).expect(409);
    expect(jsonBody<{ message: string }>(refused).message).toMatch(UNSETTLED);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(0);

    await settleCardPayments(ctx, issuedIntents);

    await staff().post(`/admin/handover/manual/${order.number}`).expect(201);
  });

  it("n'apparaît dans la file du comptoir qu'une fois réglée", async () => {
    const order = await placeUnpaid();

    expect(await queueIds()).not.toContain(order.id);

    await settleCardPayments(ctx, issuedIntents);

    expect(await queueIds()).toContain(order.id);
  });
});
