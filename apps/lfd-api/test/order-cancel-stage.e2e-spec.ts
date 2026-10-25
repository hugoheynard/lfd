/**
 * Le réglage « Jusqu'où un particulier peut-il annuler ? » (plan A1, lot A1.1 —
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`).
 *
 * A1.1 pose le réglage de bout en bout. Sous l'étape d'avant (« arrêt du
 * plan »), une commande inscrite reste refusée, au client comme au staff ; ce
 * que l'étape `ready` ouvre depuis A1.2 est éprouvé par
 * `order-cancel-after-plan.e2e-spec.ts` et sa suite des courses.
 */
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  customer,
  customerCancel,
  seedCustomerOrder,
  setCancellation,
} from "./order-customer-cancel-scene.js";
import { seedOrder } from "./order-staff-cancel-orders.js";
import { cancelRequest, deliver, resetScene } from "./order-staff-cancel-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

const ROUTE = "/admin/customer-cancellation";

function setStage(stage: string) {
  return ctx.asSub(E2E_STAFF_SUB).patch(ROUTE).send({ b2cCancellableUntil: stage });
}

describe("le réglage de l'étape (A1.1)", () => {
  it("vaut « arrêt du plan » tant que personne ne l'a posé", async () => {
    const view = await ctx.asSub(E2E_STAFF_SUB).get(ROUTE).expect(200);
    expect(view.body).toMatchObject({ b2cCancellableUntil: "production_plan" });
  });

  it("se pose seul, sans toucher au délai, et se relit", async () => {
    await setCancellation(true, 12);
    await setStage("ready").expect(204);

    const view = await ctx.asSub(E2E_STAFF_SUB).get(ROUTE).expect(200);
    expect(view.body).toMatchObject({
      delayEnabled: true,
      hoursBefore: 12,
      b2cCancellableUntil: "ready",
    });
  });

  it("refuse une étape hors liste — `handover` n'existe pas (Hugo, 2026-10-25)", async () => {
    await setStage("handover").expect(400);
  });
});

describe("étape « arrêt du plan », commande inscrite : refusée", () => {
  const DAY = serviceDay();

  it("le particulier et le staff reçoivent le refus d'avant", async () => {
    await setCancellation(false);
    await setStage("production_plan").expect(204);
    await seedOrder({ payment: PaymentStatus.paid });
    const author = await customer();
    const order = await seedCustomerOrder({
      placedByUserId: author.id,
      payment: PaymentStatus.paid,
    });
    await ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`).expect(201);
    await deliver();

    const byCustomer = await customerCancel(author.sub, order.orderId);
    expect(byCustomer.status).toBe(409);
    expect(jsonBody<{ code: string }>(byCustomer).code).toBe(
      "orders.customer_cancel.in_preparation",
    );
    const byStaff = await cancelRequest(order.orderId);
    expect(byStaff.status).toBe(409);
    expect(jsonBody<{ code: string }>(byStaff).code).toBe("orders.cancel.inscribed");
  });
});
