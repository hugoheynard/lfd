/**
 * E2E du **calculateur de tournée** — les gardes
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 7, L7-C5,
 * L7-C6, L7-C11).
 *
 * Une version périmée est refusée, une tournée partie n'est jamais touchée, un
 * arrêt chargé n'est jamais déplacé, un départ sans GPS renvoie au réglage, et
 * les droits sont ceux de la composition (L7-C7).
 */
import type { StaffRole } from "@lfd/contracts";
import type { Response } from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { declareBins, depart, loadBin } from "./delivery-loading-scene.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import {
  apply,
  forgetRoutingScene,
  ROAD_ROUTING_OVERRIDES,
  payloadOf,
  PROPOSAL,
  propose,
  seedDeparture,
  seedPlannableDelivery,
  time,
  TIMING,
  MEASURED,
  seedBinCatalog,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();
const NORTH = { lat: 45.69, lng: 5.91 };
const SOUTH = { lat: 45.5, lng: 6.05 };

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
});

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

/** Une tournée composée à la main, avec une commande située. */
async function composed(vehicleName: string, gps: typeof NORTH) {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, vehicleName, MEASURED));
  const orderId = await seedPlannableDelivery(ctx, DAY, gps);
  const stopId = await assign(ctx, DAY, roundId, orderId);
  return { roundId, orderId, stopId };
}

describe("la composition a changé depuis la proposition", () => {
  it("une version périmée est refusée — « reproposez » —, et rien n'est appliqué", async () => {
    await seedDeparture(ctx);
    const manual = await composed("Kangoo", NORTH);
    await seedPlannableDelivery(ctx, DAY, SOUTH);
    const view = await propose(ctx, `jour=${DAY}&toutRecomposer=true`);
    // Quelqu'un compose entre la proposition et l'application.
    await assign(ctx, DAY, manual.roundId, await seedPlannableDelivery(ctx, DAY, NORTH));
    const before = await roundOf(ctx, DAY, manual.roundId);

    const refused = await apply(ctx, payloadOf(view)).expect(409);

    expect(messageOf(refused)).toContain("Reproposez");
    expect(await roundOf(ctx, DAY, manual.roundId)).toEqual(before);
    expect(await ctx.prisma.deliveryRound.count()).toBe(1);
  });
});

describe("ce que la proposition ne touche jamais (L7-C5)", () => {
  it("une tournée partie : gardée, ses arrêts ne sont proposés nulle part", async () => {
    await seedDeparture(ctx);
    const gone = await composed("Kangoo", NORTH);
    const [binId] = await declareBins(ctx, gone.orderId, 1);
    await loadBin(ctx, gone.roundId, { binId: binId ?? "" }).expect(204);
    expect((await depart(ctx, gone.roundId)).status).toBe(204);
    await addVehicle(ctx, "Trafic", MEASURED);
    await seedPlannableDelivery(ctx, DAY, SOUTH);

    const view = await propose(ctx, `jour=${DAY}&toutRecomposer=true`);

    expect(view.kept).toEqual([
      expect.objectContaining({ roundId: gone.roundId, reason: "departed" }),
    ]);
    const proposed = view.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    expect(proposed).not.toContain(gone.orderId);
  });

  it("un arrêt chargé : sa tournée est gardée, et l'y déplacer quand même est refusé", async () => {
    await seedDeparture(ctx);
    const loaded = await composed("Kangoo", NORTH);
    const [binId] = await declareBins(ctx, loaded.orderId, 1);
    await loadBin(ctx, loaded.roundId, { binId: binId ?? "" }).expect(204);
    const traficId = await addVehicle(ctx, "Trafic", MEASURED);

    const view = await propose(ctx, `jour=${DAY}&toutRecomposer=true`);
    expect(view.kept).toEqual([
      expect.objectContaining({ roundId: loaded.roundId, reason: "loaded" }),
    ]);

    const forced = await apply(ctx, {
      day: DAY,
      rounds: [{ roundId: null, vehicleId: traficId, orderIds: [loaded.orderId] }],
      versions: view.versions.map(({ roundId, version }) => ({ roundId, version })),
    }).expect(409);

    expect(messageOf(forced)).toContain("déchargez-le d'abord");
    expect((await roundOf(ctx, DAY, loaded.roundId)).stops.map((stop) => stop.orderId)).toEqual([
      loaded.orderId,
    ]);
  });
});

describe("chronométrer refuse ce qu'appliquer refuserait (L10b-C2)", () => {
  it("un arrêt glissé HORS d'une tournée chargée : 409, rien d'écrit (I6)", async () => {
    await seedDeparture(ctx);
    const loaded = await composed("Kangoo", NORTH);
    const [binId] = await declareBins(ctx, loaded.orderId, 1);
    await loadBin(ctx, loaded.roundId, { binId: binId ?? "" }).expect(204);
    const traficId = await addVehicle(ctx, "Trafic", MEASURED);

    const refused = await time(ctx, {
      day: DAY,
      rounds: [{ roundId: null, vehicleId: traficId, orderIds: [loaded.orderId] }],
    }).expect(409);

    expect(messageOf(refused)).toContain("déjà chargée");
    expect((await roundOf(ctx, DAY, loaded.roundId)).stops.map((stop) => stop.orderId)).toEqual([
      loaded.orderId,
    ]);
  });

  it("un arrêt non situé : 409, en renvoyant au carnet", async () => {
    await seedDeparture(ctx);
    const kangoo = await addVehicle(ctx, "Kangoo", MEASURED);
    const lost = await seedPlannableDelivery(ctx, DAY, null);

    const refused = await time(ctx, {
      day: DAY,
      rounds: [{ roundId: null, vehicleId: kangoo, orderIds: [lost] }],
    }).expect(409);

    expect(messageOf(refused)).toContain("n'est pas située");
  });

  it("une composition vide n'a pas la forme : 400", async () => {
    await time(ctx, { day: DAY, rounds: [] }).expect(400);
  });
});

describe("le départ doit être situé", () => {
  it("sans point GPS au labo, « Proposer » refuse et renvoie au réglage", async () => {
    await seedDeparture(ctx, false);
    await addVehicle(ctx, "Kangoo", MEASURED);

    const refused = await admin(ctx).get(`${PROPOSAL}?jour=${DAY}`).expect(409);

    expect(messageOf(refused)).toContain("Point de départ");
  });
});

describe("le droit (L7-C7) : celui de la composition, rien de neuf", () => {
  it("refuse le support en lecture comme en écriture (403)", async () => {
    const support = await asRole("support");

    await support.get(`${PROPOSAL}?jour=${DAY}`).expect(403);
    await support.post(PROPOSAL).send({ day: DAY, rounds: [], versions: [] }).expect(403);
    await support.post(`${ROUNDS}/situer?jour=${DAY}`).expect(403);
    await support.post(TIMING).send({ day: DAY, rounds: [] }).expect(403);
    await support.get("/admin/livraison/calcul").expect(403);
  });
});

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
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
