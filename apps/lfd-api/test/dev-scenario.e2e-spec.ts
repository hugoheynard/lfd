/**
 * E2E du **scénario du jour par étapes** —
 * `documentation/order/plan-jeu-de-donnees-par-etapes.md`, lot J1.
 *
 * L'étape atteinte se lit en base, jamais dans une mémoire : ce que la suite
 * prouve, c'est que la remise à l'état de base repose le scénario, que chaque
 * `next` avance d'une étape et d'une seule, que la fin est refusée nommément,
 * et qu'une étape jouée à la main se lit comme si le scénario l'avait jouée.
 *
 * Six étapes, dans l'ordre que le code impose : les tournées sont composées
 * avant la production et le colisage (un demi-bac ne se partage qu'entre deux
 * arrêts consécutifs d'une tournée qui existe), cf. `today.seed.ts`.
 */
import type {
  DevScenarioNextReport,
  DevScenarioResetReport,
  DevScenarioView,
  DevSeedOrdersOnlyReport,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { PAYMENT_GATEWAY_OVERRIDE } from "./dev-scenario-scene.js";

const SCENARIO = "/admin/dev/scenario";
const RELOAD = "/admin/dev/seed/reload";
const RELOAD_ORDERS = "/admin/dev/seed/reload/orders";
/** Un rechargement complet sème des dizaines de commandes : cf. `dev-seed-driver.e2e-spec.ts`. */
const TIMEOUT_MS = 240_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedDriverRole(ctx);
  // Le décor — station, client de référence — que la remise suppose posé.
  await admin(ctx).post(RELOAD).expect(200);
  await ctx.drain();
  // Le rechargement complet dépasse les 30 s par défaut quand toute la suite
  // e2e tourne (constaté à la racine le 2026-10-05) : le délai vaut pour le crochet.
}, TIMEOUT_MS);

async function state(): Promise<DevScenarioView> {
  return jsonBody<DevScenarioView>(await admin(ctx).get(SCENARIO).expect(200));
}

async function next(): Promise<DevScenarioNextReport> {
  const report = jsonBody<DevScenarioNextReport>(
    await admin(ctx).post(`${SCENARIO}/next`).expect(200),
  );
  await ctx.drain();
  return report;
}

/**
 * Ce que la journée porte, compté : commandes prêtes, tournées, arrêts, bacs,
 * chargements, demi-bacs partagés. Deux chemins qui posent la même journée
 * rendent le même relevé.
 */
async function snapshot(): Promise<Record<string, number>> {
  const { day } = await state();
  return {
    ready: await ctx.prisma.order.count({
      where: { requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`), readyAt: { not: null } },
    }),
    handedOver: await ctx.prisma.orderHandover.count(),
    rounds: await ctx.prisma.deliveryRound.count({ where: { serviceDay: day } }),
    stops: await ctx.prisma.deliveryRoundStop.count({
      where: { serviceDay: day, removedAt: null },
    }),
    bins: await ctx.prisma.deliveryBin.count({ where: { voidedAt: null } }),
    shared: await ctx.prisma.deliveryBin.count({ where: { voidedAt: null, half: { not: null } } }),
    loads: await ctx.prisma.deliveryBinLoad.count({
      where: { serviceDay: day, loadedAt: { not: null } },
    }),
    drivers: await ctx.prisma.deliveryRound.count({
      where: { serviceDay: day, driverStaffId: { not: null } },
    }),
    packed: await ctx.prisma.packingOrder.count({
      where: { serviceDay: day, packedAt: { not: null } },
    }),
  };
}

async function reset(): Promise<DevScenarioResetReport> {
  const report = jsonBody<DevScenarioResetReport>(
    await admin(ctx).post(`${SCENARIO}/reset`).expect(200),
  );
  await ctx.drain();
  return report;
}

describe("le scénario du jour, étape par étape", () => {
  it(
    "la remise repose l'étape 0, et cinq « suivant » finissent exactement où finit le rechargement",
    async () => {
      const before = jsonBody<DevSeedOrdersOnlyReport>(
        await admin(ctx).post(RELOAD_ORDERS).expect(200),
      );
      await ctx.drain();
      const reloaded = await state();
      expect(reloaded.reached).toBe(5);
      const loaded = await snapshot();

      const removed = await reset();
      expect(removed.placed).toBe(before.orders.placed);
      expect(removed.removed.find((entry) => entry.category === "orders")?.rows).toBeGreaterThan(0);
      const base = await state();
      expect(base.reached).toBe(0);
      expect(base.steps.map((step) => step.reached)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(base.databaseBytes).toBeGreaterThan(0);

      for (const step of [1, 2, 3, 4, 5]) {
        expect(await next()).toEqual({ played: step });
        expect((await state()).reached).toBe(step);
      }
      // Le même jeu de données, compté de la même façon que par le rechargement.
      expect(await snapshot()).toEqual(loaded);
      expect((await state()).steps.map((step) => step.summary)).toEqual(
        reloaded.steps.map((step) => step.summary),
      );
    },
    TIMEOUT_MS,
  );

  /**
   * Régression : la purge ne vidait ni `delivery_day_readiness` ni la cloche
   * « plan arrêté » ; l'ensemble grandissait à chaque remise et la cloche
   * resonnait (« 17 nouvelles livraisons », 2026-10-06).
   */
  it(
    "la remise ne laisse ni l'ensemble des livraisons du jour, ni la cloche « plan arrêté » qu'il a fait sonner",
    async () => {
      const { day } = await reset();
      const bells = {
        idempotencyKey: { startsWith: `notification:delivery.plan_arrested:${day}:` },
      };
      expect(await ctx.prisma.deliveryDayReadiness.count({ where: { serviceDay: day } })).toBe(0);
      expect(await ctx.prisma.staffNotification.count({ where: bells })).toBe(0);
      await next();
      expect(await ctx.prisma.staffNotification.count({ where: bells })).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    "refuse « suivant » à l'étape 5, en le disant",
    async () => {
      expect((await state()).reached).toBe(5);
      const response = await admin(ctx).post(`${SCENARIO}/next`).expect(409);
      expect(jsonBody<{ code: string }>(response).code).toBe("dev.scenario.complete");
    },
    TIMEOUT_MS,
  );

  it(
    "compose les tournées à l'étape 2, sans aucun bac, la première affectée à qui clique",
    async () => {
      const { day } = await reset();
      await next();
      expect(await next()).toEqual({ played: 2 });
      const rounds = await ctx.prisma.deliveryRound.findMany({
        where: { serviceDay: day },
        select: { driverStaffId: true },
      });
      expect(rounds.length).toBeGreaterThan(0);
      expect(rounds.filter((round) => round.driverStaffId !== null)).toHaveLength(1);
      expect(await ctx.prisma.deliveryBin.count({ where: { voidedAt: null } })).toBe(0);
    },
    TIMEOUT_MS,
  );

  it(
    "lit l'étape atteinte quand elle a été jouée à la main, à l'écran du fournil",
    async () => {
      const { day } = await reset();
      // Le plan du soir arrêté par la route de l'atelier, pas par le scénario.
      await admin(ctx).post(`/admin/production/batch/${day}/close`).expect(201);
      await ctx.drain();

      // Depuis le 2026-10-07, l'arrêt du plan compose les tournées tout seul
      // (`DayAutoComposition`) : arrêté à l'écran du fournil, le jour est
      // déjà à l'étape 2, et la suivante part de là — le four.
      const view = await state();
      expect(view.reached).toBe(2);
      expect(view.steps[1]?.summary).toMatch(/plan arrêté/u);
      expect(await next()).toEqual({ played: 3 });
    },
    TIMEOUT_MS,
  );
});
