/**
 * E2E du **rechargement qui pose une tournée prête à partir** (2026-10-01) :
 * la tournée chargée du semis est affectée à qui a cliqué, par la vraie
 * commande d'affectation, et ce livreur peut la COMMENCER depuis « Ma
 * tournée » — tous ses bacs chargés, aucun à refaire. Un requérant sans le
 * droit de conduire ne fait pas échouer le rechargement.
 */
import type { DevSeedReport, MyDeliveryRoundsView, MyDeliveryRoundView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { MY_ROUND, seedDriverRole } from "./delivery-driver-scene.js";

const RELOAD = "/admin/dev/seed/reload";

let intentCount = 0;
/** Stripe, la seule frontière doublée en plus de la signature : le semis paie des commandes. */
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_dev_seed_${String(intentCount)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedDriverRole(ctx);
});

/**
 * Un rechargement COMPLET du jeu de données sème des dizaines de commandes par
 * les vrais handlers : 10 à 15 s seul, au-delà de 30 s quand toute la suite
 * e2e tourne (constaté le 2026-10-01 à la racine : les deux cas tombaient au
 * délai par défaut, pas sur une assertion).
 */
const FULL_RELOAD_TIMEOUT_MS = 120_000;

async function reload(): Promise<DevSeedReport> {
  return jsonBody<DevSeedReport>(await admin(ctx).post(RELOAD).expect(200));
}

describe("le rechargement affecte la tournée chargée à qui clique", () => {
  it(
    "l'affecte au requérant, et il la commence depuis « Ma tournée »",
    async () => {
      const report = await reload();

      expect(report.delivery.driver).toMatchObject({ status: "assigned" });
      const { rounds } = jsonBody<MyDeliveryRoundsView>(
        await admin(ctx).get(MY_ROUND).query({ date: report.delivery.day }).expect(200),
      );
      expect(rounds).toHaveLength(1);
      const roundId = rounds[0]?.id ?? "";
      const { version } = jsonBody<MyDeliveryRoundView>(
        await admin(ctx).get(`${MY_ROUND}/${roundId}`).expect(200),
      );

      // Prête à partir : tous les arrêts chargés, aucun bac à refaire.
      await admin(ctx).post(`${MY_ROUND}/${roundId}/depart`).send({ version }).expect(204);
    },
    FULL_RELOAD_TIMEOUT_MS,
  );

  it(
    "laisse la tournée sans livreur quand le requérant n'a pas le droit, et dit pourquoi",
    async () => {
      await ctx.prisma.staffPermissionOverride.create({
        data: {
          staffUserId: E2E_STAFF_ID,
          resource: "delivery_driving",
          action: "write",
          effect: "deny",
        },
      });

      const report = await reload();

      expect(report.delivery.driver.status).toBe("refused");
      expect(
        report.delivery.driver.status === "refused" ? report.delivery.driver.reason : "",
      ).toContain("Conduire sa tournée");
      expect(report.delivery.rounds).toBe(1);
    },
    FULL_RELOAD_TIMEOUT_MS,
  );
});
