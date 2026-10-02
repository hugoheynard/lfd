/**
 * E2E **une commande rapportée repart** (`documentation/livraisons/decisions-par-defaut-2026-10-02.md`,
 * § 4, lot RL1 ; `plan-a-la-porte.md`, B3, LB-Q2).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 * - « Rapporter » rend la commande « à répartir » sur la composition d'un
 *   AUTRE jour que sa date demandée, avec sa date de retour ;
 * - elle entre dans une tournée de cet autre jour, sans que sa date demandée
 *   change, et n'y est pas signalée « plus de ce jour » ;
 * - cette tournée part : le retrait la redit partie (BQ) ; puis elle est remise.
 */
import type { DeliveryRoundsDayView } from "@lfd/contracts";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStop,
  DOOR_DAY,
  DOOR_ROLE,
  JPEG,
  myRound,
  orderStatus,
} from "./delivery-handover-scene.js";
import { loadBin } from "./delivery-loading-scene.js";
import {
  addVehicle,
  admin,
  ADMIN_VERIFIER_OVERRIDE,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";

const DECIDE = "/admin/livraison/a-decider";
/** Le lendemain du jour demandé : là où la commande rapportée repart. */
const NEXT_DAY = serviceDay(8);

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
  forgetRoutingScene();
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DOOR_ROLE).expect(201);
});

/** Un arrêt parti, signalé « personne », rapporté par la commerciale. */
async function broughtBack() {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const lea = await staffWithRole(ctx, "commerciale-lea", "commercial");
  const stop = await departedStop(ctx, paul);
  await paul.agent
    .post(`${MY_ROUND}/${stop.roundId}/incidents`)
    .field("family", "doorstep")
    .field("reason", "nobody_present")
    .field("note", "")
    .field("stopId", stop.stopId)
    .expect(201);
  await lea.agent.post(`${DECIDE}/${stop.stopId}/rapporter`).expect(204);
  await ctx.drain();
  const decision = await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({
    where: { stopId: stop.stopId },
  });
  return { paul, ...stop, broughtBackAt: decision.decidedAt?.toISOString() };
}

function unassignedOf(view: DeliveryRoundsDayView, orderId: string) {
  return view.unassigned.find((order) => order.orderId === orderId);
}

describe("Une commande rapportée repart (RL1)", () => {
  it("🔴 réapparaît « à répartir » un AUTRE jour, datée ; placée, partie, puis remise", async () => {
    const { paul, orderId, broughtBackAt } = await broughtBack();
    expect(broughtBackAt).toBeDefined();

    // À répartir le lendemain, avec sa date de retour ; et toujours son jour.
    expect(unassignedOf(await dayView(ctx, NEXT_DAY), orderId)).toEqual(
      expect.objectContaining({ orderId, broughtBackAt }),
    );
    expect(unassignedOf(await dayView(ctx, DOOR_DAY), orderId)).toMatchObject({ broughtBackAt });

    // Placée dans une tournée du lendemain : sa date demandée ne bouge pas.
    const roundId = await openRound(ctx, NEXT_DAY, await addVehicle(ctx, "Trafic"));
    await assign(ctx, NEXT_DAY, roundId, orderId);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const placed = await dayView(ctx, NEXT_DAY);
    expect(unassignedOf(placed, orderId)).toBeUndefined();
    expect(placed.rounds[0]?.stops[0]).toMatchObject({ orderId, signals: [], broughtBackAt });
    expect(unassignedOf(await dayView(ctx, DOOR_DAY), orderId)).toBeUndefined();

    // Rechargée, partie : le retrait la redit partie.
    // Les mêmes bacs reviennent : on les recharge, rien n'est redéclaré.
    const bin = await ctx.prisma.deliveryBin.findFirstOrThrow({ where: { orderId } });
    const reload = await loadBin(ctx, roundId, { binId: bin.id });
    expect([reload.status, reload.text]).toEqual([204, ""]);
    const { version } = await roundOf(ctx, NEXT_DAY, roundId);
    await admin(ctx)
      .put(`${ROUNDS}/${roundId}/livreur`)
      .send({ staffUserId: paul.id, version })
      .expect(204);
    const departed = await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version: (await myRound(paul.agent, roundId)).version });
    expect([departed.status, departed.text]).toEqual([204, ""]);
    await ctx.drain();
    const departure = await ctx.prisma.orderDeparture.findUniqueOrThrow({ where: { orderId } });
    expect(departure.returnedAt).toBeNull();
    expect(departure.departedAt.getTime()).toBeGreaterThan(new Date(broughtBackAt ?? 0).getTime());

    // Remise au client, au nouvel arrêt.
    const stop = await ctx.prisma.deliveryRoundStop.findFirstOrThrow({
      where: { orderId, roundId },
    });
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stop.id}/remise`)
      .field("version", String((await myRound(paul.agent, roundId)).version))
      .field("receiverName", "Mme Durand")
      .attach("photo", JPEG, "remise.jpg")
      .expect(204);
    await ctx.drain();
    expect(await orderStatus(ctx, orderId)).toBe("fulfilled");
    expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      requestedDeliveryDate: order.requestedDeliveryDate,
    });
    expect(unassignedOf(await dayView(ctx, NEXT_DAY), orderId)).toBeUndefined();
  });

  it("une commande d'un autre jour, NON rapportée, reste refusée au lendemain", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { orderId } = await departedStop(ctx, paul);
    const roundId = await openRound(ctx, NEXT_DAY, await addVehicle(ctx, "Trafic"));
    const { version } = await roundOf(ctx, NEXT_DAY, roundId);

    const refused = await admin(ctx).post(`${ROUNDS}/${roundId}/arrets`).send({ orderId, version });

    expect(refused.status).toBe(409);
    expect(unassignedOf(await dayView(ctx, NEXT_DAY), orderId)).toBeUndefined();
  });
});
