/**
 * E2E de **« Relancer », du balayage et du droit** du remboursement à
 * l'annulation (plan `documentation/order/plan-annulation-de-commande.md`, lot
 * C4, C4.7 (b), (c), C4.9). La scène est partagée avec
 * `order-staff-cancel-refund.e2e-spec.ts`.
 */
import type { RoleGrant } from "@lfd/contracts";
import type request from "supertest";

import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { cancelRequest, deliver, resetScene } from "./order-staff-cancel-scene.js";
import {
  advanceWallPastRetries,
  bootRefundScene,
  resetStripe,
  seedPaidOrder,
  stripe,
  sweepRefunds,
} from "./order-staff-cancel-refund-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootRefundScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
  resetStripe();
});

afterEach(() => {
  expect(stripe.underTransaction).toBe(0);
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;
const retry = (orderId: string, sub = E2E_STAFF_SUB) =>
  ctx.asSub(sub).post(`/admin/orders/${orderId}/refund/retry`);

describe("« Relancer » et le balayage", () => {
  it("refus nommés : pas de demande (404), déjà émise (409)", async () => {
    const { orderId } = await seedPaidOrder();
    await retry(orderId).expect(404);

    await cancelRequest(orderId).expect(204);
    await deliver();
    const response = await retry(orderId);
    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.refund_request.awaiting_bank");
  });

  it("25 demandes dues : 20 au premier passage, 5 au suivant", async () => {
    for (let n = 0; n < 25; n += 1) {
      const { orderId } = await seedPaidOrder();
      stripe.script.push({ kind: "unavailable" });
      await cancelRequest(orderId).expect(204);
    }
    await deliver();
    stripe.calls.splice(0);
    advanceWallPastRetries();

    expect(jsonBody<{ readonly taken: number }>(await sweepRefunds().expect(200)).taken).toBe(20);
    expect(jsonBody<{ readonly taken: number }>(await sweepRefunds().expect(200)).taken).toBe(5);
    expect(stripe.calls).toHaveLength(25);
  });

  it("sans jeton machine : 401", async () => {
    await ctx.http().post("/admin/orders/refunds/sweep").expect(401);
  });

  it("sans `b2b_cancel_order:write` : 403 sur l'annulation ET sur « Relancer »", async () => {
    const { orderId } = await seedPaidOrder();
    const grants: readonly RoleGrant[] = [{ resource: "b2b_orders", action: "write" }];
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({ key: "commandes", label: "commandes", grants })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Commandes",
        email: "commandes@lfc.test",
        role: null,
        roleKey: "commandes",
        status: "active",
        auth0Id: "staff-commandes",
      },
    });

    await cancelRequest(orderId, "staff-commandes").expect(403);
    await retry(orderId, "staff-commandes").expect(403);
  });
});
