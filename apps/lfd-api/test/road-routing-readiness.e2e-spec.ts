/**
 * E2E **la disponibilité du calcul routier**
 * (`GET /admin/delivery/road-routing/readiness`).
 *
 * En e2e, aucun calcul routier n'est configuré : la route répond prêt, et
 * Tour manager ne voile rien. Le mur des droits : `delivery_rounds:read`
 * lit, un autre droit 403.
 */
import type { RoadRoutingReadinessView } from "@lfd/contracts";

import { staffWithRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const READINESS = "/admin/delivery/road-routing/readiness";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("GET /admin/delivery/road-routing/readiness", () => {
  it("sans calcul routier configuré : prêt, et jamais en cache partagé", async () => {
    const response = await ctx.asSub(E2E_STAFF_SUB).get(READINESS).expect(200);

    expect(jsonBody<RoadRoutingReadinessView>(response)).toEqual({ ready: true });
    expect(response.headers["cache-control"]).toContain("private");
  });

  it("sans `delivery_rounds:read` : 403", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({
        key: "comptoir-seul",
        label: "comptoir-seul",
        grants: [{ resource: "handover_counter", action: "write" }],
      })
      .expect(201);
    const other = await staffWithRole(ctx, "comptoir-1", "comptoir-seul");

    await other.agent.get(READINESS).expect(403);
  });
});
