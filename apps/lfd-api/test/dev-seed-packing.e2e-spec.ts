/**
 * E2E du **rechargement de dev sur le colisage** — plan
 * `documentation/colisage/colisage.md`, lot K2 (§13 : « la
 * répétition de K2 se fait aussi en dev, avec le semis »).
 *
 * Le bouton « Recharger » rejoue la journée du jour par les vrais handlers :
 * clôture, fournées, colisage, une fournée reprise, des fermetures. Depuis K2,
 * cette journée naît au colisage ; ce qui suit prouve qu'elle s'y joue de bout
 * en bout, boîte d'envoi comprise, et que rien n'y reste en souffrance.
 */
import type { DevSeedReport } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";

const RELOAD = "/admin/dev/seed/reload";
/** Cf. `dev-seed-driver.e2e-spec.ts` : un rechargement complet est long. */
const FULL_RELOAD_TIMEOUT_MS = 120_000;

let intentCount = 0;
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_dev_packing_${String(intentCount)}`;
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

describe("le rechargement de dev joue la journée du jour au colisage (K2)", () => {
  it(
    "clôture, colisage, retour et fermetures passent par le colisage, sans message en souffrance",
    async () => {
      const report = jsonBody<DevSeedReport>(await admin(ctx).post(RELOAD).expect(200));
      await ctx.drain();
      const day = report.delivery.day;

      const owner = await ctx.prisma.productionDay.findUniqueOrThrow({
        where: { serviceDay: day },
        select: { packingOwner: true },
      });
      expect(owner.packingOwner).toBe("packing");

      // Les bacs fermés au colisage, et eux seuls : l'ancien poste n'a rien écrit.
      const sealed = await ctx.prisma.packingOrder.count({
        where: { serviceDay: day, packedAt: { not: null } },
      });
      expect(sealed).toBeGreaterThan(0);
      expect(
        await ctx.prisma.productionOrder.count({
          where: { serviceDay: day, packedAt: { not: null } },
        }),
      ).toBe(0);
      expect(
        await ctx.prisma.outboxMessage.count({ where: { type: "packing.order_packed" } }),
      ).toBe(sealed);

      // K3c : plus d'ancien poste — aucune commande `counted`, et chaque bac de
      // livraison du jour est né au colisage, par un contenant.
      expect(
        await ctx.prisma.packingOrder.count({
          where: { serviceDay: day, containerMode: "counted" },
        }),
      ).toBe(0);
      const bins = await ctx.prisma.deliveryBin.count({ where: { voidedAt: null } });
      expect(bins).toBeGreaterThan(0);
      expect(await ctx.prisma.packingContainer.count({ where: { binId: { not: null } } })).toBe(
        bins,
      );

      // La fournée reprise : rendue entière par le colisage, annulée au fournil.
      const request = await ctx.prisma.productionReturnRequest.findFirstOrThrow({
        where: { serviceDay: day },
        select: { quantity: true, returned: true, batchId: true },
      });
      expect(request.returned).toBe(request.quantity);
      const batch = await ctx.prisma.productionBatch.findUniqueOrThrow({
        where: { id: request.batchId },
        select: { cancelledAt: true },
      });
      expect(batch.cancelledAt).not.toBeNull();

      // Le badge « Pro » / « Public » du poste (2026-10-06) : chaque commande
      // semée passe par la clôture réelle, sa clientèle arrive donc rangée.
      expect(
        await ctx.prisma.packingOrder.count({ where: { serviceDay: day, clientele: null } }),
      ).toBe(0);
      expect(
        await ctx.prisma.packingOrder.count({ where: { serviceDay: day, clientele: "pro" } }),
      ).toBeGreaterThan(0);

      // Rien n'est resté en route : aucune livraison en échec.
      expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(
        0,
      );
    },
    FULL_RELOAD_TIMEOUT_MS,
  );

  /**
   * Régression (2026-10-05) : le second rechargement du même jour échouait sur
   * « Il manque 35 Croissant sortis du four ». Les faits du premier passage
   * restaient dans l'outbox, et leur clé unique absorbait la remise au colisage.
   */
  it(
    "se rejoue le même jour sans manquer la remise au colisage",
    async () => {
      await admin(ctx).post(RELOAD).expect(200);
      await ctx.drain();
      const report = jsonBody<DevSeedReport>(await admin(ctx).post(RELOAD).expect(200));
      await ctx.drain();

      expect(report.delivery.rounds).toBeGreaterThan(0);
    },
    FULL_RELOAD_TIMEOUT_MS * 2,
  );
});
