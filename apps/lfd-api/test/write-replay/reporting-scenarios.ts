import { jsonBody } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const HTTP = "lafoliecoffee/reporting/http";
const ROUTE = "/admin/export-keys";
const YEAR_MS = 365 * 24 * 60 * 60 * 1_000;

/** Les clés de l'export des ventes : créer (secret montré une fois) et révoquer. */
export const REPORTING_SCENARIOS: ScenarioSet = {
  [routeKey(`${HTTP}/admin-export-keys.controller.ts`, "issue")]: ({ clock }) =>
    Promise.resolve({
      sub: STAFF,
      path: ROUTE,
      body: {
        label: "Direction",
        expiresAt: new Date(clock.now().getTime() + YEAR_MS).toISOString(),
        allowedIps: [],
      },
      replay: "shown-once",
    }),

  [routeKey(`${HTTP}/admin-export-keys.controller.ts`, "revoke")]: async ({ ctx, clock }) => {
    const response = await ctx
      .asSub(STAFF)
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "Direction",
        expiresAt: new Date(clock.now().getTime() + YEAR_MS).toISOString(),
        allowedIps: [],
      })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(response);
    return { sub: STAFF, path: `${ROUTE}/${id}/revoke` };
  },
};
