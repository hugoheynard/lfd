import type { CreatedIdResponse } from "@lfd/contracts";

import { jsonBody, serviceDay, type E2eContext } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { payByCard, placeOrder } from "../order-factory.js";
import { CROISSANT, closePlan, SERVICE_DAY } from "../production-day-fixture.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

const WORKSTATIONS_CONTROLLER =
  "production/workstations/http/production-workstations.controller.ts";
const STEPS_CONTROLLER = "production/atelier/http/production-line-steps.controller.ts";
const WORKSTATIONS = "/admin/production/workstations";
const PRODUCT = "VIE-001";
const LINE = `/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}`;

/** Un poste posé par la route. */
async function station(ctx: E2eContext, name: string): Promise<string> {
  return jsonBody<CreatedIdResponse>(
    await ctx
      .asSub(STAFF)
      .post(WORKSTATIONS)
      .set(INTENT_KEY, freshIntent())
      .send({ name })
      .expect(201),
  ).id;
}

/** Ce poste de plus pour le produit, par la vraie route. */
async function addTo(ctx: E2eContext, workstationId: string): Promise<void> {
  await ctx
    .asSub(STAFF)
    .post(`${WORKSTATIONS}/${workstationId}/products`)
    .set(INTENT_KEY, freshIntent())
    .send({ productSkus: [PRODUCT] })
    .expect(204);
}

/**
 * Deux postes sur le croissant — le premier le finit, le second en est une
 * étape —, trois croissants payés et le plan arrêté.
 */
async function closedDayWithStep(ctx: E2eContext): Promise<string> {
  await addTo(ctx, await station(ctx, "Tourage"));
  const step = await station(ctx, "Pétrissage");
  await addTo(ctx, step);
  const buyer = await createUser(ctx.prisma, { auth0Sub: "replay-etape", firstName: "Léa" });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: serviceDay(),
    fulfillment: { method: "pickup", pickupSiteId: await pickupPoint(ctx) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await payByCard(ctx, order);
  await closePlan(ctx);
  await ctx.drain();
  return step;
}

/** Un produit sur plusieurs postes (`fournil/un-produit-sur-plusieurs-postes.md`). */
export const PRODUCTION_STEPS_SCENARIOS: ScenarioSet = {
  [routeKey(WORKSTATIONS_CONTROLLER, "addToProducts")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${WORKSTATIONS}/${await station(ctx, "Viennoiserie")}/products`,
    body: { productSkus: [PRODUCT] },
  }),

  [routeKey(WORKSTATIONS_CONTROLLER, "removeFromProducts")]: async ({ ctx }) => {
    const id = await station(ctx, "Viennoiserie");
    await addTo(ctx, id);
    return {
      sub: STAFF,
      path: `${WORKSTATIONS}/${id}/products/removal`,
      body: { productSkus: [PRODUCT] },
    };
  },

  [routeKey(WORKSTATIONS_CONTROLLER, "setFinishing")]: async ({ ctx }) => {
    await addTo(ctx, await station(ctx, "Tourage"));
    const second = await station(ctx, "Cuisson");
    await addTo(ctx, second);
    return {
      sub: STAFF,
      path: `${WORKSTATIONS}/${second}/finishing`,
      body: { productSku: PRODUCT },
    };
  },

  [routeKey(STEPS_CONTROLLER, "markDone")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${LINE}/steps/${await closedDayWithStep(ctx)}`,
  }),

  [routeKey(STEPS_CONTROLLER, "markRed")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${LINE}/steps/${await closedDayWithStep(ctx)}/red`,
    body: { reason: "pâte trop molle" },
  }),

  [routeKey(STEPS_CONTROLLER, "undo")]: async ({ ctx }) => {
    const step = await closedDayWithStep(ctx);
    await ctx
      .asSub(STAFF)
      .post(`${LINE}/steps/${step}`)
      .set(INTENT_KEY, freshIntent())
      .send()
      .expect(204);
    return { sub: STAFF, path: `${LINE}/steps/${step}` };
  },
};
