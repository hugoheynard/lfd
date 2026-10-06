/**
 * E2E **une commande rapportée repart** (`documentation/livraisons/decisions-par-defaut-2026-10-02.md`,
 * § 4, lot RL1 ; `a-la-porte.md`, B3, LB-Q2).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 * - « Rapporter » rend la commande « à répartir » sur la composition d'un
 *   AUTRE jour que sa date demandée, avec sa date de retour ;
 * - elle entre dans une tournée de cet autre jour, sans que sa date demandée
 *   change, et n'y est pas signalée « plus de ce jour » ;
 * - cette tournée part : le retrait la redit partie (BQ) ; puis elle est remise ;
 * - placée un autre jour, la feuille de route de ce jour la sert quand l'écran
 *   la nomme — adresse, fenêtre, procédure (§ 4, suite de RL1) ;
 * - « Proposer » de l'autre jour la place, comme une commande du jour.
 */
import type { DeliveryRoundsDayView, DeliveryRunSheetView } from "@lfd/contracts";

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
import {
  forgetRoutingScene,
  propose,
  ROAD_ROUTING_OVERRIDES,
  seedDeparture,
  MEASURED,
  seedBinCatalog,
  withBread,
} from "./delivery-routing-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const DECIDE = "/admin/livraison/a-decider";
const RUN_SHEET = "/admin/livraison/feuille-de-route";
/** Le lendemain du jour demandé : là où la commande rapportée repart. */
const NEXT_DAY = serviceDay(8);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, ...ROAD_ROUTING_OVERRIDES] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await seedBinCatalog(ctx);
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

async function runSheet(query: string): Promise<DeliveryRunSheetView> {
  return jsonBody<DeliveryRunSheetView>(await admin(ctx).get(`${RUN_SHEET}?${query}`).expect(200));
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
    const roundId = await openRound(ctx, NEXT_DAY, await addVehicle(ctx, "Trafic", MEASURED));
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
    // « Ma tournée » du lendemain : la fiche de l'arrêt, figée au départ, porte
    // l'adresse et le point — lus par commande, jamais par jour demandé.
    const mine = await myRound(paul.agent, roundId);
    expect(mine.stops).toHaveLength(1);
    expect(mine.stops[0]).toMatchObject({ reference: order.orderNumber, bins: 1 });
    expect(mine.stops[0]?.address?.ligne1).toMatch(/rue des Alpes/u);
    expect(mine.stops[0]?.gps).not.toBeNull();
    const departure = await ctx.prisma.orderDeparture.findUniqueOrThrow({ where: { orderId } });
    expect(departure.returnedAt).toBeNull();
    expect(departure.departedAt?.getTime()).toBeGreaterThan(new Date(broughtBackAt ?? 0).getTime());

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
    const roundId = await openRound(ctx, NEXT_DAY, await addVehicle(ctx, "Trafic", MEASURED));
    const { version } = await roundOf(ctx, NEXT_DAY, roundId);

    const refused = await admin(ctx).post(`${ROUNDS}/${roundId}/arrets`).send({ orderId, version });

    expect(refused.status).toBe(409);
    expect(unassignedOf(await dayView(ctx, NEXT_DAY), orderId)).toBeUndefined();
  });

  it("🔴 placée le lendemain, la feuille de route du lendemain la sert quand l'écran la nomme", async () => {
    const { orderId } = await broughtBack();
    const roundId = await openRound(ctx, NEXT_DAY, await addVehicle(ctx, "Trafic", MEASURED));
    await assign(ctx, NEXT_DAY, roundId, orderId);
    const own = (await runSheet(`jour=${DOOR_DAY}`)).stops.find((s) => s.orderId === orderId);

    const plain = await runSheet(`jour=${NEXT_DAY}`);
    const named = await runSheet(`jour=${NEXT_DAY}&commandes=${orderId}`);

    // Le jour seul ne la connaît pas : c'est la composition qui l'a placée.
    expect(plain.stops.map((stop) => stop.orderId)).toEqual([]);
    expect(named.stops.map((stop) => stop.orderId)).toEqual([orderId]);
    expect(own).toBeDefined();
    expect(named.stops[0]).toMatchObject({
      address: own?.address,
      window: own?.window,
      addressBook: own?.addressBook,
      withoutAtelierSheet: false,
    });
    expect(named.stops[0]?.address?.ligne1).toMatch(/rue des Alpes/u);
  });

  it("🔴 « Proposer » du lendemain la place, comme une commande du jour", async () => {
    const { orderId } = await broughtBack();
    await seedDeparture(ctx);
    // « Proposer » exige un véhicule mesuré (CA-D3) : celui de la livraison n'a pas de cotes.
    await addVehicle(ctx, "Trafic", MEASURED);
    // Et une demande en bacs connue (CA4) : un pain, un Bac M estimé.
    await withBread(ctx, orderId);

    const view = await propose(ctx, `jour=${NEXT_DAY}`);

    expect(view.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId))).toEqual([
      orderId,
    ]);
  });
});
