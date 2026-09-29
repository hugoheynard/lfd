/**
 * **Le plan de chargement v1** (plan de tournée, lot 4 bis, L4b-C7, v2-5,
 * tranche D) — sur le vrai Postgres : l'ordre inverse de la tournée, le bac
 * partagé en haut de la pile du premier arrêt, les bacs annulés exclus, le
 * volume face au véhicule, le plan vide lisible, et le droit `delivery_loading`.
 */
import type { CreatedIdResponse, DeliveryLoadingPlanView, StaffRole } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  seedDelivery,
  VEHICLES,
} from "./delivery-rounds-scene.js";
import { BINS, declareTypedBins, LOADING, loadingOf } from "./delivery-loading-scene.js";

const DAY = serviceDay();

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

function planOf(roundId: string) {
  return admin(ctx).get(`${LOADING}/chargement/${roundId}/plan`);
}

/** Un véhicule de 1 000 L utiles, dont 100 L réfrigérés — par la route de la flotte. */
async function measuredVehicle(): Promise<string> {
  const response = await admin(ctx)
    .post(VEHICLES)
    .send({
      name: "Trafic mesuré",
      plate: "PL-123-AN",
      cargo: { lengthCm: 100, widthCm: 100, heightCm: 100 },
      refrigeration: { volumeLiters: 100, minTempC: 2, maxTempC: 6 },
    })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

describe("le plan de chargement d'une tournée composée", () => {
  it("charge à l'envers, pose le bac partagé en haut du premier arrêt, ignore les bacs annulés", async () => {
    const roundId = await openRound(ctx, DAY, await measuredVehicle());
    const orders = [
      await seedDelivery(ctx, DAY),
      await seedDelivery(ctx, DAY),
      await seedDelivery(ctx, DAY),
    ] as const;
    for (const order of orders) {
      await assign(ctx, DAY, roundId, order.id);
    }
    await declareTypedBins(ctx, { orderId: orders[0].id, whole: 1, half: false, innerBags: 0 });
    const [left] = await declareTypedBins(ctx, {
      orderId: orders[0].id,
      whole: 0,
      half: true,
      innerBags: 0,
    });
    await admin(ctx)
      .post(`${BINS}/partage`)
      .send({ orderId: orders[1].id, partnerBinId: left, innerBags: 0 })
      .expect(201);
    const [voided] = await declareTypedBins(ctx, {
      orderId: orders[1].id,
      whole: 1,
      half: false,
      innerBags: 0,
    });
    await admin(ctx).post(`${BINS}/${voided}/annulation`).expect(204);
    await declareTypedBins(ctx, { orderId: orders[2].id, whole: 2, half: false, innerBags: 0 });
    const positions = (await loadingOf(ctx, roundId)).stops.map((stop) => stop.position);

    const plan = jsonBody<DeliveryLoadingPlanView>(await planOf(roundId).expect(200));

    expect(plan.vehicleName).toBe("Trafic mesuré");
    expect(
      plan.order.map((step) => [step.step, step.reference, step.bins.map((bin) => bin.half)]),
    ).toEqual([
      [1, orders[2].reference, [null, null]],
      [2, orders[1].reference, []],
      [3, orders[0].reference, [null, "left", "right"]],
    ]);
    const shared = plan.order[2]?.bins.slice(1) ?? [];
    expect(shared.map((bin) => [bin.reference, bin.sharedWithReference])).toEqual([
      [orders[0].reference, orders[1].reference],
      [orders[1].reference, orders[0].reference],
    ]);
    expect(plan.stacks).toEqual([
      {
        stackIndex: 1,
        binTypeName: "Bac M e2e",
        height: 4,
        maxStack: 5,
        stopPositions: [positions[2], positions[0]],
      },
    ]);
    // Quatre bacs physiques de 60 × 40 × 22 cm = 211,2 L, arrondis au-dessus.
    expect(plan.volume).toEqual({
      dryLiters: 212,
      coldLiters: 0,
      dryCapacityLiters: 900,
      coldCapacityLiters: 100,
      dryOver: false,
      coldOver: false,
    });
    expect(plan.warnings).toEqual([]);
  });

  it("une tournée sans bac : un plan vide, lisible, qui ne promet pas que ça tient", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    await assign(ctx, DAY, roundId, (await seedDelivery(ctx, DAY)).id);

    const plan = jsonBody<DeliveryLoadingPlanView>(await planOf(roundId).expect(200));

    expect(plan.order.map((step) => step.bins)).toEqual([[]]);
    expect(plan.stacks).toEqual([]);
    expect(plan.volume).toMatchObject({ dryLiters: 0, dryCapacityLiters: null, dryOver: false });
    expect(plan.warnings.map((warning) => warning.kind)).toEqual(["unknown_cargo"]);
  });

  it("une tournée inconnue répond 404", async () => {
    await planOf("round_inconnue").expect(404);
  });
});

describe("le droit `delivery_loading` (Q21)", () => {
  async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
    const sub = `staff-${role}`;
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: role,
        email: `${role}@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    return ctx.asSub(sub);
  }

  it("le support ne lit pas le plan (403) ; le comptoir le lit", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    await (await asRole("support")).get(`${LOADING}/chargement/${roundId}/plan`).expect(403);
    await (await asRole("comptoir")).get(`${LOADING}/chargement/${roundId}/plan`).expect(200);
  });
});
