/**
 * E2E du **rang à la livraison** (plan E7 reliquat, lot L3c,
 * `documentation/commandes/plan-e7-reliquat-bati.md`) : un arrêt dessert un
 * ENVOI `(commande, rang)`, et le plan arrêté range des envois.
 *
 * Ce que seul le vrai Postgres prouve : que l'index I3 recréé sur
 * `(order_id, rank)` laisse deux arrêts vivants d'une même commande à deux
 * rangs, et refuse toujours deux arrêts vivants du MÊME envoi ; que la table
 * fille du plan arrêté garde les deux rangs, et que l'écran les compte.
 *
 * Aucun geste ne pose encore un arrêt de rang 2 (il viendra avec L7/L8) :
 * l'arrêt est ajouté à la tournée RÉHYDRATÉE, puis rangé par le vrai
 * adaptateur — jamais par une écriture brute.
 */
import type { DeliveryDayReadinessView } from "@lfd/contracts";

import { LearnRetakenPlan } from "../src/delivery/application/handlers/learn-retaken-plan.handler.js";
import { DeliveryRound } from "../src/delivery/domain/entities/delivery-round.js";
import { OrderAlreadyInRoundError } from "../src/delivery/domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../src/delivery/domain/ports/delivery-round.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import {
  ProductionDayRetakenEvent,
  ShipmentRef,
} from "../src/production/channels/delivery/index.js";
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

const DAY = serviceDay();
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

/** Ajoute à la tournée relue un arrêt vivant de cet envoi, puis la range. */
async function addShipmentStop(roundId: string, stopId: string, shipment: ShipmentRef) {
  await ctx.app.get(UnitOfWork).run(async () => {
    const rounds = ctx.app.get(DeliveryRoundRepository);
    const loaded = await rounds.load(roundId);
    if (loaded === null) {
      throw new TypeError(`tournée ${roundId} introuvable`);
    }
    const state = loaded.toSnapshot();
    const extended = DeliveryRound.restore({
      ...state,
      stops: [
        ...state.stops,
        {
          kind: "order",
          id: stopId,
          orderId: shipment.orderId,
          shipmentRank: shipment.rank,
          position: state.stops.length + 1,
          closedAt: null,
        },
      ],
    });
    await rounds.save(extended);
  });
}

async function stopRanksOf(orderId: string): Promise<readonly number[]> {
  const stops = await ctx.prisma.deliveryRoundStop.findMany({
    where: { orderId, removedAt: null, closedAt: null },
    select: { rank: true },
    orderBy: { rank: "asc" },
  });
  return stops.map((stop) => stop.rank);
}

async function setup(): Promise<{ readonly roundId: string; readonly orderId: string }> {
  const vehicleId = await addVehicle(ctx, "Kangoo", MEASURED);
  await binTypeId(ctx);
  const order = await seedDelivery(ctx, DAY);
  await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
  const roundId = await openRound(ctx, DAY, vehicleId);
  await assign(ctx, DAY, roundId, order.id);
  return { roundId, orderId: order.id };
}

describe("deux arrêts d'une commande, deux rangs (plan E7 reliquat, L3c)", () => {
  it("l'arrêt posé par le geste est l'envoi de rang 1", async () => {
    const { orderId } = await setup();

    expect(await stopRanksOf(orderId)).toEqual([1]);
  });

  it("le rang 2 de la même commande entre dans une tournée vivante à côté du rang 1", async () => {
    const { roundId, orderId } = await setup();

    await addShipmentStop(roundId, "stop_rank_2", ShipmentRef.of(orderId, 2));

    expect(await stopRanksOf(orderId)).toEqual([1, 2]);
  });

  it("deux arrêts vivants du MÊME envoi restent refusés par l'index I3", async () => {
    const { roundId, orderId } = await setup();
    await addShipmentStop(roundId, "stop_rank_2", ShipmentRef.of(orderId, 2));

    await expect(
      addShipmentStop(roundId, "stop_rank_2_bis", ShipmentRef.of(orderId, 2)),
    ).rejects.toBeInstanceOf(OrderAlreadyInRoundError);
    expect(await stopRanksOf(orderId)).toEqual([1, 2]);
  });

  it("le plan arrêté range les deux envois, et l'écran les compte placés", async () => {
    const { roundId, orderId } = await setup();
    await addShipmentStop(roundId, "stop_rank_2", ShipmentRef.of(orderId, 2));
    const retake = new ProductionDayRetakenEvent(DAY, new Date(daysAgo(0)), 1, [
      ShipmentRef.firstOf(orderId),
      ShipmentRef.of(orderId, 2),
    ]).durableFact();

    await ctx.app
      .get(UnitOfWork)
      .run(() =>
        ctx.app
          .get(LearnRetakenPlan)
          .handle({ eventId: "e_rank_2", type: retake.type, payload: retake.payload }),
      );

    const rows = await ctx.prisma.deliveryDayReadinessShipment.findMany({
      where: { serviceDay: DAY },
      select: { orderId: true, rank: true },
      orderBy: { rank: "asc" },
    });
    expect(rows).toEqual([
      { orderId, rank: 1 },
      { orderId, rank: 2 },
    ]);
    const view = jsonBody<DeliveryDayReadinessView>(
      await admin(ctx).get(`${ROUNDS}/plan-stopped?day=${DAY}`).expect(200),
    );
    expect(view.arrested).toMatchObject({ deliveryCount: 2, unplacedCount: 0 });
  });
});
