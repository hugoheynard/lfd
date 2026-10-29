/**
 * E2E du **scénario du jour par étapes** —
 * `documentation/commandes/architecture-jeu-de-donnees-par-etapes.md`, lot J1.
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
  StaffNote,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { PAYMENT_GATEWAY_OVERRIDE } from "./dev-scenario-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

const SCENARIO = "/admin/dev/scenario";
const RELOAD = "/admin/dev/seed/reload";
const RELOAD_ORDERS = "/admin/dev/seed/reload/orders";
/** Un rechargement complet sème des dizaines de commandes : cf. `dev-seed-driver.e2e-spec.ts`. */
const TIMEOUT_MS = 240_000;

let ctx: E2eContext;

beforeAll(async () => {
  // La carte routière doublée : l'arrêt du plan compose les tournées
  // (2026-10-07), et la CI n'a pas d'OSRM — vert en local, rouge en CI.
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE, ...ROAD_ROUTING_OVERRIDES],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Les saumons au poids que la commande mêlée du scénario commande.
  await seedWeighedArticles(ctx);
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

  /**
   * La commande mêlée (2026-10-29) : l'Hôtel des Pins prend ses viennoiseries
   * à la pièce et deux saumons au poids. Rechargée jusqu'à l'étape 5, elle
   * doit être portée par les trois papiers du jour — le compte du fournil (un
   * lot au poids entier, en grammes), le colisage (au bac, en un lot) et le
   * bon de livraison (l'unité de la ligne).
   */
  it(
    "porte la commande mêlée, pièces et poids, du fournil au bon de livraison",
    async () => {
      const { day } = await state();
      const serviceDay = new Date(`${day}T00:00:00.000Z`);
      const order = await ctx.prisma.order.findFirstOrThrow({
        where: { requestedDeliveryDate: serviceDay, company: { enseigne: "Hôtel des Pins" } },
        select: { id: true, lines: { select: { sku: true, quantity: true, saleUnit: true } } },
      });
      const weighed = order.lines.filter((line) => line.saleUnit === "weight");
      expect(weighed.map((line) => line.quantity).sort((a, b) => a - b)).toEqual([850, 1_500]);
      expect(order.lines.some((line) => line.saleUnit === "piece")).toBe(true);

      const gravlax = weighed.find((line) => line.quantity === 1_500)?.sku ?? "";
      expect(
        await ctx.prisma.productionCount.findMany({
          where: { serviceDay: day, sku: gravlax },
          select: { quantity: true, saleUnit: true },
        }),
      ).toEqual([{ quantity: 1_500, saleUnit: "weight" }]);

      const packed = await ctx.prisma.packingLine.findMany({
        where: { serviceDay: day, orderId: order.id, saleUnit: "weight" },
        select: { quantity: true, packedAt: true },
      });
      expect(packed).toHaveLength(2);
      expect(packed.every((line) => line.packedAt !== null)).toBe(true);

      const notes = jsonBody<readonly StaffNote[]>(
        await admin(ctx).get(`/admin/orders/${order.id}/delivery-notes`).expect(200),
      );
      const noteLines = notes.flatMap((note) => note.lines);
      expect(
        noteLines
          .filter((line) => line.saleUnit === "weight")
          .map((line) => line.quantity)
          .sort((a, b) => a - b),
      ).toEqual([850, 1_500]);
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

  /**
   * Régression : la décision de départ incomplet (`order_shortfall_decision`,
   * 2026-10-25) tient sa commande en `RESTRICT`, et la purge ne la
   * connaissait pas — « La remise à l'état de base n'a pas abouti — Une
   * ressource liée est introuvable » (Hugo, 2026-10-25).
   */
  it(
    "la remise à l'état de base passe après les gestes du jour",
    async () => {
      const { day } = await reset();
      for (const step of [1, 2, 3]) {
        expect(await next()).toEqual({ played: step });
      }
      const order = await shortfallCandidate(day);
      const packing = `/admin/packing/${day}/orders/${order.id}`;
      const bag = jsonBody<{ containerId: string }>(
        await admin(ctx).post(`${packing}/containers`).send({ nature: "bag" }).expect(201),
      );
      await admin(ctx)
        .post(`${packing}/containers/${bag.containerId}/lines/${order.sku}`)
        .send({ quantity: 1 })
        .expect(204);
      await admin(ctx).post(`${packing}/shortfall`).expect(204);
      await ctx.drain();
      await admin(ctx)
        .post(`/admin/orders/${order.id}/shortfall-decision`)
        .send({ remainder: "abandoned" })
        .expect(204);
      await ctx.drain();
      expect(await ctx.prisma.orderShortfallDecision.count()).toBe(1);

      await reset();
      expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
      expect((await state()).reached).toBe(0);
    },
    TIMEOUT_MS,
  );
});

/**
 * Une commande du jour au compte, au retrait, dont une ligne compte plus d'une
 * pièce : la seule forme dont on peut décider un départ incomplet (ni carte,
 * ni bon de fidélité).
 */
async function shortfallCandidate(day: string): Promise<{ id: string; sku: string }> {
  const orders = await ctx.prisma.order.findMany({
    where: {
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      stripePaymentIntentId: null,
      loyaltyVoucherId: null,
      cancelledAt: null,
    },
    select: { id: true, lines: { select: { sku: true, quantity: true } } },
  });
  for (const order of orders) {
    const line = order.lines.find((candidate) => candidate.quantity > 1);
    if (line !== undefined) {
      return { id: order.id, sku: line.sku };
    }
  }
  throw new Error(`Le scénario du ${day} ne porte aucune commande au compte à départ incomplet.`);
}
