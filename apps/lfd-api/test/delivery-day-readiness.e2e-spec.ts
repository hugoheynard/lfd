/**
 * E2E du **plan arrêté vu par la livraison** (plan de composition
 * automatique, §16.5, CA6a) : une vraie clôture du fournil publie
 * `production.day_closed` dans la boîte d'envoi ; l'abonné de la livraison
 * range l'ensemble des livraisons du jour et sonne le bureau — une fois.
 *
 * Ce que seul le vrai Postgres prouve : que la ligne tombe avec le relais,
 * que le reçu de la boîte d'envoi rend le rejeu sans effet, et que la route
 * de l'écran lit ce qui a été rangé.
 *
 * CA6b : un vrai retirage publie `production.day_retaken` avec les commandes
 * absorbées ; l'abonné du retirage les ajoute et sonne le seul delta.
 */
import { instantToLocal, type DeliveryDayReadinessView } from "@lfd/contracts";

import { LEARN_ARRESTED_PLAN } from "../src/delivery/application/handlers/learn-arrested-plan.handler.js";
import { LEARN_RETAKEN_PLAN } from "../src/delivery/application/handlers/learn-retaken-plan.handler.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { binTypeId } from "./delivery-loading-scene.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const DAY = serviceDay();
const KIND = "delivery.plan_arrested";
const MEASURED = { lengthCm: 250, widthCm: 150, heightCm: 140 };

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

async function closePlan(): Promise<{ readonly closedAt: string }> {
  const response = await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
  return jsonBody<{ readonly closedAt: string }>(response);
}

async function retakePlan(): Promise<void> {
  await admin(ctx).post(`/admin/production/worksheet/${DAY}/retake`).expect(201);
  await ctx.drain();
}

async function readiness(): Promise<DeliveryDayReadinessView> {
  return jsonBody<DeliveryDayReadinessView>(
    await admin(ctx).get(`${ROUNDS}/plan-arrete?jour=${DAY}`).expect(200),
  );
}

function bells() {
  return ctx.prisma.staffNotification.findMany({
    where: { kind: KIND },
    select: { subject: true, body: true, audience: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

describe("la livraison apprend la clôture du fournil", () => {
  it("avant l'arrêt, l'écran n'a rien à dire", async () => {
    await seedDelivery(ctx, DAY);

    expect(await readiness()).toEqual({ day: DAY, arrested: null });
  });

  it("une clôture réelle range les livraisons du jour et sonne une fois le bureau", async () => {
    await addVehicle(ctx, "Kangoo", MEASURED);
    await binTypeId(ctx);
    const first = await seedDelivery(ctx, DAY);
    await seedDelivery(ctx, DAY);

    const closure = await closePlan();

    const row = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
      where: { serviceDay: DAY },
    });
    expect(row.closedAt).toEqual(new Date(closure.closedAt));
    expect(row.deliveryOrderIds).toHaveLength(2);
    expect(row.deliveryOrderIds).toContain(first.id);
    const [bell, ...others] = await bells();
    expect(others).toEqual([]);
    expect(bell?.subject).toMatch(/est arrêté : 2 livraisons à mettre en tournées$/u);
    expect(bell?.audience).toBe("delivery_rounds:write");
  });

  it("le rejeu du même fait ne sonne pas une seconde fois", async () => {
    await seedDelivery(ctx, DAY);
    await closePlan();

    // Un relais mort après l'effet : la livraison revient, la garde trouve le reçu.
    await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: LEARN_ARRESTED_PLAN },
      data: { claimedUntil: daysAgo(1) },
    });
    await ctx
      .http()
      .post("/admin/outbox/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    await ctx.drain();

    expect(await bells()).toHaveLength(1);
  });

  it("une réannonce qui recouvre ne sonne pas", async () => {
    await seedDelivery(ctx, DAY);
    await closePlan();

    await closePlan();

    expect(await bells()).toHaveLength(1);
  });

  it("sans flotte mesurée ni bac, la cloche et l'écran disent ce qui manque (CA-D3)", async () => {
    await seedDelivery(ctx, DAY);

    await closePlan();

    const [bell] = await bells();
    expect(bell?.body).toContain("Impossible de proposer les tournées");
    expect((await readiness()).arrested?.compositionGap).toBe("no_measured_vehicle");
  });

  it("l'écran lit le compte et les livraisons encore hors tournée", async () => {
    const vehicleId = await addVehicle(ctx, "Kangoo", MEASURED);
    await binTypeId(ctx);
    const placed = await seedDelivery(ctx, DAY);
    await seedDelivery(ctx, DAY);
    const closure = await closePlan();
    const roundId = await openRound(ctx, DAY, vehicleId);
    await assign(ctx, DAY, roundId, placed.id);

    expect(await readiness()).toEqual({
      day: DAY,
      arrested: {
        closedAt: closure.closedAt,
        deliveryCount: 2,
        unplacedCount: 1,
        compositionGap: null,
        // Dans une semaine : ni aujourd'hui, ni demain (§5).
        due: null,
      },
    });
  });
});

describe("la livraison apprend le retirage du fournil (CA6b)", () => {
  it("un vrai retirage ajoute les livraisons absorbées et sonne le delta", async () => {
    await seedDelivery(ctx, DAY);
    await closePlan();
    const late = await seedDelivery(ctx, DAY);
    await seedDelivery(ctx, DAY);

    await retakePlan();

    const row = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
      where: { serviceDay: DAY },
    });
    expect(row.deliveryOrderIds).toHaveLength(3);
    expect(row.deliveryOrderIds).toContain(late.id);
    const subjects = (await bells()).map((bell) => bell.subject);
    expect(subjects).toHaveLength(2);
    expect(subjects[0]).toMatch(/est arrêté : 1 livraison à mettre en tournées$/u);
    expect(subjects[1]).toMatch(/est complété : 2 nouvelles livraisons à placer$/u);
    expect((await readiness()).arrested?.deliveryCount).toBe(3);
  });

  it("le rejeu du retirage ne sonne pas une seconde fois", async () => {
    await seedDelivery(ctx, DAY);
    await closePlan();
    await seedDelivery(ctx, DAY);
    await retakePlan();

    await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: LEARN_RETAKEN_PLAN },
      data: { claimedUntil: daysAgo(1) },
    });
    await ctx
      .http()
      .post("/admin/outbox/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    await ctx.drain();

    expect(await bells()).toHaveLength(2);
  });
});

/**
 * L'alerte avant le jour J (composition automatique, §5) : le jour de
 * livraison est AUJOURD'HUI à Paris — la cloche le regarde à toute heure, ce
 * qui rend la suite indépendante de l'heure à laquelle elle tourne.
 */
describe("l'alerte « hors tournée » avant le jour J", () => {
  const TODAY = instantToLocal(new Date(Date.now())).day;
  const GAP = "delivery.rounds_gap";

  function sweep() {
    return ctx
      .http()
      .post("/admin/livraison/hors-tournee/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
  }

  function gapBells() {
    return ctx.prisma.staffNotification.findMany({
      where: { kind: GAP },
      select: { subject: true, audience: true, link: true },
    });
  }

  async function closeToday(): Promise<void> {
    await admin(ctx).post(`/admin/production/batch/${TODAY}/close`).expect(201);
    await ctx.drain();
  }

  it("plan arrêté, aucune tournée : l'écran dit « aujourd'hui », la cloche sonne une fois", async () => {
    await seedDelivery(ctx, TODAY);
    await seedDelivery(ctx, TODAY);
    await closeToday();

    const view = jsonBody<DeliveryDayReadinessView>(
      await admin(ctx).get(`${ROUNDS}/plan-arrete?jour=${TODAY}`).expect(200),
    );
    expect(view.arrested).toMatchObject({ due: "today", unplacedCount: 2 });

    expect(jsonBody<{ readonly alerted: readonly string[] }>(await sweep())).toEqual({
      alerted: [TODAY],
    });
    await sweep();

    const bells = await gapBells();
    expect(bells).toHaveLength(1);
    expect(bells[0]?.subject).toMatch(/^Aujourd'hui, .* : 2 livraisons hors tournée$/u);
    expect(bells[0]?.audience).toBe("delivery_rounds:write");
    expect(bells[0]?.link).toBe(`/livraison/tournees?jour=${TODAY}`);
  });

  it("tout en tournée : pas de cloche", async () => {
    const vehicleId = await addVehicle(ctx, "Kangoo", MEASURED);
    const order = await seedDelivery(ctx, TODAY);
    await closeToday();
    const roundId = await openRound(ctx, TODAY, vehicleId);
    await assign(ctx, TODAY, roundId, order.id);

    expect(jsonBody<{ readonly alerted: readonly string[] }>(await sweep())).toEqual({
      alerted: [],
    });
    expect(await gapBells()).toEqual([]);
  });

  it("sans jeton machine, la route refuse", async () => {
    await ctx.http().post("/admin/livraison/hors-tournee/sweep").expect(401);
  });
});
