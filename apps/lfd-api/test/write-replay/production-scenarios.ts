import { jsonBody, type E2eContext } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

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
};
