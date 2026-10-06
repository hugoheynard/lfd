/**
 * E2E **les corrections du carnet suggérées au bureau**
 * (`documentation/livraisons/gps-y-aller-et-position.md`, §6).
 *
 * Ce que seul le vrai SQL prouve :
 * - les positions relevées au geste, rattachées à leur adresse du carnet par
 *   le canal du commerce, sous le mur : 3 remises concordantes → une
 *   suggestion ; 2 → rien ; dispersées → rien ;
 * - « Appliquer » écrit le CARNET (le commerce, par son agrégat), journalise
 *   `company.delivery_address_point_corrected`, et le départ suivant fige la
 *   porte et le stationnement ;
 * - « Ignorer » ne la repropose pas ;
 * - seul qui organise les tournées (`delivery_rounds:write`) voit la liste.
 */
import type { AddressPointSuggestionsView, GpsPoint } from "@lfd/contracts";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStop,
  departedStops,
  type DoorDriver,
  DOOR_ROLE,
  JPEG,
  myRound,
} from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const SUGGESTIONS = "/admin/livraison/carnet-a-corriger";
/** Le point du carnet que la scène sème (`delivery-handover-scene.ts`). */
const CARNET = { lat: 45.6, lng: 6.1 };
/** Un degré de latitude ≈ 111 km : `north(120)` est 120 m au nord du carnet. */
const north = (meters: number): GpsPoint => ({
  lat: CARNET.lat + meters / 111_195,
  lng: CARNET.lng,
});

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

function positionOf(point: GpsPoint): Record<string, string> {
  return {
    positionLat: String(point.lat),
    positionLng: String(point.lng),
    positionAccuracyM: "6",
  };
}

async function handOver(driver: DoorDriver, roundId: string, stopId: string, at: GpsPoint) {
  const version = (await myRound(driver.agent, roundId)).version;
  let call = driver.agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
    .field("version", String(version))
    .field("receiverName", "Réception");
  for (const [name, value] of Object.entries(positionOf(at))) {
    call = call.field(name, value);
  }
  await call.attach("photo", JPEG, "remise.jpg").expect(204);
}

/** Relie la commande à l'adresse (et la société) d'une autre : « la même adresse ». */
async function relinkTo(orderId: string, sameAs: string): Promise<void> {
  const source = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: sameAs },
    select: { companyId: true, deliveryAddressId: true },
  });
  await ctx.prisma.order.update({
    where: { id: orderId },
    data: { companyId: source.companyId, deliveryAddressId: source.deliveryAddressId },
  });
}

/**
 * Une tournée de `doors.length` arrêts à la MÊME adresse : chacun arrive à
 * `arrivals[i]` (s'il est donné) et remet à `doors[i]`.
 */
async function deliveredAt(
  doors: readonly GpsPoint[],
  arrivals: readonly GpsPoint[] = [],
): Promise<{ readonly firstOrderId: string; readonly paul: DoorDriver }> {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const { roundId, stops } = await departedStops(ctx, paul, doors.length);
  const firstOrderId = stops[0]?.orderId ?? "";
  for (const [index, stop] of stops.entries()) {
    await relinkTo(stop.orderId, firstOrderId);
    const arrival = arrivals[index];
    if (arrival !== undefined) {
      await paul.agent
        .post(`${MY_ROUND}/${roundId}/arrets/${stop.stopId}/arrivee`)
        .send({ positionLat: arrival.lat, positionLng: arrival.lng, positionAccuracyM: 6 })
        .expect(204);
    }
    await handOver(paul, roundId, stop.stopId, doors[index] ?? CARNET);
  }
  return { firstOrderId, paul };
}

async function suggestions(): Promise<AddressPointSuggestionsView> {
  return jsonBody<AddressPointSuggestionsView>(
    await ctx.asSub(E2E_STAFF_SUB).get(SUGGESTIONS).expect(200),
  );
}

describe("la règle — combien de livraisons, et où", () => {
  it("3 remises concordantes à ~120 m : la porte est suggérée, 3 livraisons", async () => {
    await deliveredAt([north(118), north(120), north(122)]);

    const view = await suggestions();

    expect(view.suggestions).toHaveLength(1);
    expect(view.suggestions[0]).toMatchObject({
      kind: "door",
      reference: "carnet",
      recorded: CARNET,
      distanceM: 120,
      concordant: 3,
    });
  });

  it("2 remises : rien", async () => {
    await deliveredAt([north(118), north(122)]);

    expect((await suggestions()).suggestions).toEqual([]);
  });

  it("3 remises dispersées : rien", async () => {
    await deliveredAt([north(100), north(200), north(300)]);

    expect((await suggestions()).suggestions).toEqual([]);
  });
});

describe("« Appliquer » et « Ignorer »", () => {
  it("appliquer la porte et le stationnement : le carnet, le journal, puis le départ suivant les fige", async () => {
    const doors = [north(118), north(120), north(122)];
    const parking = [north(-80), north(-81), north(-79)];
    const { firstOrderId, paul } = await deliveredAt(doors, parking);
    const shown = (await suggestions()).suggestions;
    expect(shown.map((s) => s.kind).sort()).toEqual(["door", "parking"]);

    for (const suggestion of shown) {
      await ctx
        .asSub(E2E_STAFF_SUB)
        .post(`${SUGGESTIONS}/${suggestion.addressId}/appliquer`)
        .send({ kind: suggestion.kind, point: suggestion.suggested })
        .expect(204);
    }

    const door = shown.find((s) => s.kind === "door")?.suggested;
    const park = shown.find((s) => s.kind === "parking")?.suggested;
    const address = await ctx.prisma.address.findUniqueOrThrow({
      where: { id: shown[0]?.addressId ?? "" },
      select: { deliverySpecs: true, parkingLat: true, parkingLng: true },
    });
    expect(address.deliverySpecs).toMatchObject({ gps: door });
    expect({ lat: address.parkingLat, lng: address.parkingLng }).toEqual(park);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "company.delivery_address_point_corrected" },
      }),
    ).toBe(2);
    expect(
      await ctx.prisma.deliveryAddressSuggestionDecision.count({ where: { outcome: "applied" } }),
    ).toBe(2);
    expect((await suggestions()).suggestions).toEqual([]);

    const next = await departedStop(ctx, paul, (orderId) => relinkTo(orderId, firstOrderId));
    const frozen = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({
      where: { stopId: next.stopId },
      select: { gpsLat: true, gpsLng: true, parkingLat: true, parkingLng: true },
    });
    expect({ lat: frozen.gpsLat, lng: frozen.gpsLng }).toEqual(door);
    expect({ lat: frozen.parkingLat, lng: frozen.parkingLng }).toEqual(park);
    const stop = (await myRound(paul.agent, next.roundId)).stops[0];
    expect(stop?.gps).toEqual(door);
    expect(stop?.parking).toEqual(park);
  });

  it("ignorer : le carnet ne bouge pas, et la suggestion ne revient pas", async () => {
    await deliveredAt([north(118), north(120), north(122)]);
    const [shown] = (await suggestions()).suggestions;

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`${SUGGESTIONS}/${shown?.addressId ?? ""}/ignorer`)
      .send({ kind: "door", point: shown?.suggested })
      .expect(204);

    expect((await suggestions()).suggestions).toEqual([]);
    const address = await ctx.prisma.address.findUniqueOrThrow({
      where: { id: shown?.addressId ?? "" },
      select: { deliverySpecs: true },
    });
    expect(address.deliverySpecs).toMatchObject({ gps: CARNET });
  });

  it("un point que le bureau n'a pas vu : 409, rien n'est écrit", async () => {
    await deliveredAt([north(118), north(120), north(122)]);
    const [shown] = (await suggestions()).suggestions;

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`${SUGGESTIONS}/${shown?.addressId ?? ""}/appliquer`)
      .send({ kind: "door", point: north(400) })
      .expect(409);

    expect(await ctx.prisma.deliveryAddressSuggestionDecision.count()).toBe(0);
  });
});

describe("les droits — les positions ne se voient qu'en organisant les tournées", () => {
  it("le livreur : 403 en lecture comme en écriture", async () => {
    const { paul } = await deliveredAt([north(118), north(120), north(122)]);

    await paul.agent.get(SUGGESTIONS).expect(403);
    await paul.agent
      .post(`${SUGGESTIONS}/x/ignorer`)
      .send({ kind: "door", point: north(120) })
      .expect(403);
  });

  it("qui lit seulement les tournées (`delivery_rounds:read`) : 403", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({
        key: "lecteur-tournees",
        label: "Lecteur des tournées",
        grants: [{ resource: "delivery_rounds", action: "read" }],
      })
      .expect(201);
    const reader = await staffWithRole(ctx, "lecteur-1", "lecteur-tournees");

    await reader.agent.get(SUGGESTIONS).expect(403);
  });
});
