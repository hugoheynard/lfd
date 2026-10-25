/**
 * E2E du **contrôle des totaux du BL sur le scénario de démonstration** (plan
 * plan E4a (`documentation/commandes/bon-de-livraison.md`), § 2 et § 3) : le jeu
 * de démonstration joué jusqu'aux tournées chargées, le contrôle du
 * réconciliateur rend zéro écart. C'est la condition qu'E4b exigera avant
 * que la facture lise le BL.
 *
 * Doublés : ceux de `dev-scenario-stability` (jetons, Stripe, routage).
 */
import type { DevScenarioResetReport } from "@lfd/contracts";

import type { DeliveryNoteReconciliationReport } from "../src/b2b/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { PAYMENT_GATEWAY_OVERRIDE } from "./dev-scenario-scene.js";

const SCENARIO = "/admin/dev/scenario";
/** La dernière étape du scénario : « tournées chargées, prêtes à partir ». */
const LAST_STEP = 5;
const TIMEOUT_MS = 300_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE, ...ROAD_ROUTING_OVERRIDES],
  });
  await ctx.reset();
  await seedDriverRole(ctx);
  await admin(ctx).post("/admin/dev/seed/reload").expect(200);
  await ctx.drain();
}, TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

describe("le contrôle des totaux du BL, sur le scénario de démonstration", () => {
  it(
    "chaque BL vivant d'une commande complète reprend ses totaux : zéro écart",
    async () => {
      jsonBody<DevScenarioResetReport>(await admin(ctx).post(`${SCENARIO}/reset`).expect(200));
      await ctx.drain();
      for (let step = 1; step <= LAST_STEP; step += 1) {
        await admin(ctx).post(`${SCENARIO}/next`).expect(200);
        await ctx.drain();
      }

      const report = jsonBody<DeliveryNoteReconciliationReport>(
        await admin(ctx).post("/admin/delivery-notes/reconcile").expect(200),
      );

      expect(report.failed).toBe(0);
      expect(report.terms.compared).toBeGreaterThan(0);
      expect(report.terms.gaps).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
