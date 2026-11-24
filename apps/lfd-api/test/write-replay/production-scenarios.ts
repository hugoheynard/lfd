import { DOSSIER_PARTS } from "../../src/production/plan/domain/services/day-dossier-selection.js";
import { jsonBody, serviceDay, type E2eContext } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { payByCard, placeOrder } from "../order-factory.js";
import { CROISSANT, closePlan, recordBatch, SERVICE_DAY } from "../production-day-fixture.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

const CONTROLLER = "production/workstations/http/production-workstations.controller.ts";
const WORKSTATIONS = "/admin/production/workstations";

/** Un poste posé par la route. */
async function workstation(ctx: E2eContext, name: string): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(WORKSTATIONS)
    .set(INTENT_KEY, freshIntent())
    .send({ name })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

const WORKSHEET = "production/atelier/http/production-worksheet.controller.ts";
const SUPERVISION = "production/atelier/http/production-supervision.controller.ts";
const LINE = `/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}`;

/** Trois croissants payés, plan arrêté, une fournée de deux déclarée. */
async function closedDayWithBatch(ctx: E2eContext): Promise<void> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "replay-fournil", firstName: "Léa" });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: serviceDay(),
    fulfillment: { method: "pickup", pickupSiteId: await pickupPoint(ctx) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await payByCard(ctx, order);
  await closePlan(ctx);
  await ctx.drain();
  expect(await recordBatch(ctx, "01K6A0000000000000000000A1", 2)).toBe(204);
}

/** Les gestes de la fiche par intention (`fournil/les-niveaux-de-suivi.md`). */
const WORKSHEET_SCENARIOS: ScenarioSet = {
  [routeKey(WORKSHEET, "markDone")]: async ({ ctx }) => {
    await closedDayWithBatch(ctx);
    return { sub: STAFF, path: `${LINE}/done` };
  },

  [routeKey(WORKSHEET, "reportProblem")]: async ({ ctx }) => {
    await closedDayWithBatch(ctx);
    return { sub: STAFF, path: `${LINE}/problem`, body: { produced: 1, reason: "brûlé" } };
  },

  [routeKey(SUPERVISION, "resolveProductionProblem")]: async ({ ctx }) => {
    await closedDayWithBatch(ctx);
    await ctx
      .asSub(STAFF)
      .post(`${LINE}/problem`)
      .set(INTENT_KEY, freshIntent())
      .send({ produced: 1 })
      .expect(204);
    await ctx.drain();
    const problem = await ctx.prisma.productionProblem.findFirstOrThrow({ select: { id: true } });
    return { sub: STAFF, path: `/admin/supervision/production-problems/${problem.id}/resolve` };
  },
};

const TRACKING_SETTINGS = "production/atelier/http/production-tracking-settings.controller.ts";

/** Les réglages de suivi par intention (`fournil/les-niveaux-de-suivi.md`). */
const TRACKING_SCENARIOS: ScenarioSet = {
  [routeKey(TRACKING_SETTINGS, "setTracking")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/production/settings/tracking",
      body: { level: "simple", marginMinutes: 20 },
    }),

  [routeKey(CONTROLLER, "setTrackingLevel")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${WORKSTATIONS}/${await workstation(ctx, "Pâtisserie")}/tracking-level`,
    body: { trackingLevel: "detailed" },
  }),
};

const PROVISIONAL = "production/plan/http/provisional-print.controller.ts";

/** L'impression provisoire, avant l'arrêt (`fournil/dossier-prod-du-jour.md`). */
const PRINT_SCENARIOS: ScenarioSet = {
  [routeKey(PROVISIONAL, "draw")]: async ({ ctx }) => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: "replay-apercu", firstName: "Léo" });
    const order = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: serviceDay(),
      fulfillment: { method: "pickup", pickupSiteId: await pickupPoint(ctx) },
      lines: [{ sku: CROISSANT, quantity: 2 }],
    });
    await payByCard(ctx, order);
    await ctx.drain();
    return {
      sub: STAFF,
      path: `/admin/production/batch/${SERVICE_DAY}/provisional-print`,
      body: { parts: [...DOSSIER_PARTS], groups: "all", orders: { kind: "all" } },
    };
  },
};

/** Les postes du fournil (plan `fournil/les-postes-du-fournil.md`, W1). */
export const PRODUCTION_SCENARIOS: ScenarioSet = {
  [routeKey(CONTROLLER, "declare")]: () =>
    Promise.resolve({ sub: STAFF, path: WORKSTATIONS, body: { name: "Tourier" } }),

  [routeKey(CONTROLLER, "rename")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${WORKSTATIONS}/${await workstation(ctx, "Patisserie")}/name`,
    body: { name: "Pâtisserie" },
  }),

  [routeKey(CONTROLLER, "reorder")]: async ({ ctx }) => {
    const bread = await workstation(ctx, "Boulangerie");
    const pastry = await workstation(ctx, "Pâtisserie");
    return { sub: STAFF, path: `${WORKSTATIONS}/order`, body: { ids: [pastry, bread] } };
  },

  [routeKey(CONTROLLER, "archive")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${WORKSTATIONS}/${await workstation(ctx, "Ancien four")}/archive`,
  }),

  [routeKey(CONTROLLER, "place")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${WORKSTATIONS}/placements`,
    body: { productSkus: ["VIE-001"], workstationId: await workstation(ctx, "Viennoiserie") },
  }),

  ...WORKSHEET_SCENARIOS,
  ...TRACKING_SCENARIOS,
  ...PRINT_SCENARIOS,
};
