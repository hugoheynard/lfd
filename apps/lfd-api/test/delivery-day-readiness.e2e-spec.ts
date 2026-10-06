/**
 * E2E du **plan arrêté vu par la livraison** (plan de composition
 * automatique, §16.5, CA6a) : une vraie clôture du fournil publie
 * `production.day_closed` dans la boîte d'envoi ; l'abonné de la livraison
 * range l'ensemble des livraisons du jour et sonne le bureau — une fois.
 *
 * Ce que seul le vrai Postgres prouve : que la ligne tombe avec le relais,
 * que le reçu de la boîte d'envoi rend le rejeu sans effet, et que la route
 * de l'écran lit ce qui a été rangé.
 */
import type { DeliveryDayReadinessView } from "@lfd/contracts";

import { LEARN_ARRESTED_PLAN } from "../src/delivery/application/handlers/learn-arrested-plan.handler.js";
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

async function readiness(): Promise<DeliveryDayReadinessView> {
  return jsonBody<DeliveryDayReadinessView>(
    await admin(ctx).get(`${ROUNDS}/plan-arrete?jour=${DAY}`).expect(200),
  );
}

function bells() {
  return ctx.prisma.staffNotification.findMany({
    where: { kind: KIND },
    select: { subject: true, body: true, audience: true },
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
      },
    });
  });
});
