/**
 * E2E **« Y aller » et la position au geste**
 * (`documentation/livraisons/gps-y-aller-et-position.md`, YA3, YA-D4).
 *
 * Ce que seul le vrai SQL prouve :
 * - YA3 : un geste qui clôt un arrêt pose `closed_at`, et « Ma tournée » le
 *   relit — l'arrêt suivant devient le premier restant, celui que « Y aller »
 *   vise (`remainingStops` côté écran filtre ce `closedAt`) ;
 * - la position facultative arrive en base avec le geste (arrivée, remise,
 *   clôture sans remise), le CHECK l'accepte, et son absence n'empêche rien ;
 * - la purge efface les COLONNES à 60 jours, garde la ligne, et sa route est
 *   fermée sans jeton machine ;
 * - la v2 du texte d'information rouvre le dialogue d'un livreur qui avait
 *   accusé la v1.
 */
import type { MyDriverNoticeView } from "@lfd/contracts";
import type { Response } from "supertest";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStops,
  type DoorDriver,
  DOOR_ROLE,
  JPEG,
  myRound,
} from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SWEEP = "/admin/livraison/positions/sweep";
const AT_DOOR = { positionLat: 45.4612, positionLng: 6.9031, positionAccuracyM: 14 };

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

async function handOver(
  driver: DoorDriver,
  roundId: string,
  stopId: string,
  position: Readonly<Record<string, number>> = {},
): Promise<Response> {
  const version = (await myRound(driver.agent, roundId)).version;
  let call = driver.agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
    .field("version", String(version))
    .field("receiverName", "Mme Durand");
  for (const [name, value] of Object.entries(position)) {
    call = call.field(name, String(value));
  }
  return call.attach("photo", JPEG, "remise.jpg");
}

function closedPosition(stopId: string) {
  return ctx.prisma.deliveryRoundStop.findUniqueOrThrow({
    where: { id: stopId },
    select: { closedAt: true, closedLat: true, closedLng: true, closedAccuracyM: true },
  });
}

describe("YA3 — un arrêt clos sort des liens", () => {
  it("la remise du premier arrêt : « Ma tournée » le rend clos, le second devient le suivant", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 2);
    const [first, second] = stops;

    expect((await handOver(paul, roundId, first?.stopId ?? "")).status).toBe(204);

    const view = await myRound(paul.agent, roundId);
    const open = view.stops
      .filter((stop) => stop.closedAt === null)
      .sort((a, b) => a.rank - b.rank)
      .map((stop) => stop.stopId);
    expect(open).toEqual([second?.stopId]);
    expect(view.stops.find((stop) => stop.stopId === first?.stopId)?.closedAt).not.toBeNull();
  });
});

describe("YA-D4 — la position au geste", () => {
  it("remise avec position : les trois colonnes en base", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 1);
    const stopId = stops[0]?.stopId ?? "";

    expect((await handOver(paul, roundId, stopId, AT_DOOR)).status).toBe(204);

    expect(await closedPosition(stopId)).toMatchObject({
      closedLat: 45.4612,
      closedLng: 6.9031,
      closedAccuracyM: 14,
    });
  });

  it("position indisponible : le geste s'enregistre, les colonnes restent nulles", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 1);
    const stopId = stops[0]?.stopId ?? "";

    expect((await handOver(paul, roundId, stopId)).status).toBe(204);

    const row = await closedPosition(stopId);
    expect(row.closedAt).not.toBeNull();
    expect(row).toMatchObject({ closedLat: null, closedLng: null, closedAccuracyM: null });
  });

  it("position incomplète ou impossible : 400, l'arrêt reste ouvert", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 1);
    const stopId = stops[0]?.stopId ?? "";

    const partial = { positionLat: 45, positionLng: 6 };
    expect((await handOver(paul, roundId, stopId, partial)).status).toBe(400);
    expect((await handOver(paul, roundId, stopId, { ...AT_DOOR, positionLat: 95 })).status).toBe(
      400,
    );

    expect((await closedPosition(stopId)).closedAt).toBeNull();
  });

  it("« Je suis arrivé » avec position, puis sans corps : la première fait foi", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 1);
    const stopId = stops[0]?.stopId ?? "";

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`)
      .send(AT_DOOR)
      .expect(204);
    await paul.agent.post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`).expect(204);

    const execution = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({
      where: { stopId },
      select: { arrivedAt: true, arrivedLat: true, arrivedLng: true, arrivedAccuracyM: true },
    });
    expect(execution.arrivedAt).not.toBeNull();
    expect(execution).toMatchObject({
      arrivedLat: 45.4612,
      arrivedLng: 6.9031,
      arrivedAccuracyM: 14,
    });
  });
});

describe("la purge des positions à 60 jours", () => {
  it("sans jeton machine : 401", async () => {
    await ctx.http().post(SWEEP).expect(401);
  });

  it("efface à 61 jours, garde à 59 — les colonnes seulement, l'arrêt reste clos", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stops } = await departedStops(ctx, paul, 2);
    const [old = { stopId: "" }, recent = { stopId: "" }] = stops;
    for (const stop of [old, recent]) {
      await paul.agent
        .post(`${MY_ROUND}/${roundId}/arrets/${stop.stopId}/arrivee`)
        .send(AT_DOOR)
        .expect(204);
      expect((await handOver(paul, roundId, stop.stopId, AT_DOOR)).status).toBe(204);
    }
    // Le temps ne se rejoue pas par un geste : on vieillit les deux relevés.
    for (const [stop, days] of [
      [old, 61],
      [recent, 59],
    ] as const) {
      const at = new Date(daysAgo(days));
      await ctx.prisma.deliveryRoundStop.update({
        where: { id: stop.stopId },
        data: { closedAt: at },
      });
      await ctx.prisma.deliveryStopExecution.update({
        where: { stopId: stop.stopId },
        data: { arrivedAt: at },
      });
    }

    const report = await ctx
      .http()
      .post(SWEEP)
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(jsonBody<{ purged: number }>(report)).toEqual({ purged: 2 });

    const erased = await closedPosition(old.stopId);
    expect(erased.closedAt).not.toBeNull();
    expect(erased).toMatchObject({ closedLat: null, closedLng: null, closedAccuracyM: null });
    expect((await closedPosition(recent.stopId)).closedLat).toBe(45.4612);
    const arrivals = await ctx.prisma.deliveryStopExecution.findMany({
      where: { roundId },
      select: { stopId: true, arrivedAt: true, arrivedLat: true },
    });
    expect(arrivals.find((row) => row.stopId === old.stopId)).toMatchObject({ arrivedLat: null });
    expect(arrivals.find((row) => row.stopId === recent.stopId)?.arrivedLat).toBe(45.4612);
    expect(arrivals.every((row) => row.arrivedAt !== null)).toBe(true);
  });
});

describe("la v2 du texte d'information", () => {
  it("un livreur qui avait accusé la v1 revoit le dialogue une fois", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    // L'accusé d'une version passée : aucun geste ne peut plus l'écrire aujourd'hui.
    await ctx.prisma.deliveryDriverNoticeAcknowledgement.create({
      data: { staffId: paul.id, version: 1, acknowledgedAt: new Date(daysAgo(3)) },
    });

    const before = jsonBody<MyDriverNoticeView>(
      await paul.agent.get("/admin/livraison/mes-donnees").expect(200),
    );
    expect(before.notice.version).toBe(2);
    expect(before.acknowledgedAt).toBeNull();
  });
});
