/**
 * E2E du **livreur et de sa tournée** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT2 et MT3) — l'affectation fondée sur le droit effectif, le mur dans la
 * requête (404 en liste ET en détail ET au départ), le départ par le livreur
 * avec ses phrases, le rang et le point figés, et une vue sans argent.
 */
import type {
  DeliveryDriversView,
  MyDeliveryRoundsView,
  MyDeliveryRoundView,
} from "@lfd/contracts";
import type { Response } from "supertest";

import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import { declareBins, depart, loadBin } from "./delivery-loading-scene.js";
import {
  forgetRoutingScene,
  seedDeparture,
  seedLocatedDelivery,
} from "./delivery-routing-scene.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";

const DAY = serviceDay();
const POINT = { lat: 45.6, lng: 6.1 };

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
  await seedDriverRole(ctx);
});

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

/** Affecte `staffUserId` à la version courante, par la route de la composition. */
async function assignDriver(roundId: string, staffUserId: string, status = 204): Promise<Response> {
  const { version } = await roundOf(ctx, DAY, roundId);
  return admin(ctx)
    .put(`${ROUNDS}/${roundId}/livreur`)
    .send({ staffUserId, version })
    .expect(status);
}

/** Une tournée d'un arrêt situé, ses bacs déclarés ; `load` les charge. */
async function roundWithStop(
  vehicle: string,
  load: boolean,
): Promise<{ readonly roundId: string; readonly orderId: string }> {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, vehicle));
  const orderId = await seedLocatedDelivery(ctx, DAY, POINT);
  await assign(ctx, DAY, roundId, orderId);
  const bins = await declareBins(ctx, orderId, 1);
  if (load) {
    await loadBin(ctx, roundId, { binId: bins[0] ?? "" }).expect(204);
  }
  return { roundId, orderId };
}

async function myRound(agent: ReturnType<E2eContext["asSub"]>, roundId: string) {
  return jsonBody<MyDeliveryRoundView>(await agent.get(`${MY_ROUND}/${roundId}`).expect(200));
}

describe("affecter un livreur (MT2)", () => {
  it("propose ceux qui tiennent le droit EFFECTIF — l'admin oui, le comptoir non, une dérogation retire", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    await staffWithRole(ctx, "vendeur", "comptoir", "comptoir");
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: lea.id, resource: "delivery_driving", action: "write", effect: "deny" },
    });

    const { drivers } = jsonBody<DeliveryDriversView>(
      await admin(ctx).get(`${ROUNDS}/livreurs`).expect(200),
    );

    expect(drivers.map((driver) => driver.staffUserId).sort()).toEqual(
      [E2E_STAFF_ID, paul.id].sort(),
    );
  });

  it("affecte, puis la vue Tournées le nomme — et dit « sans accès » quand il perd le droit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    await assignDriver(roundId, paul.id);
    expect((await roundOf(ctx, DAY, roundId)).driver).toEqual({
      staffUserId: paul.id,
      name: "livreur-paul Test",
      canDrive: true,
    });

    await ctx.prisma.staffUser.update({ where: { id: paul.id }, data: { status: "suspended" } });
    expect((await roundOf(ctx, DAY, roundId)).driver?.canDrive).toBe(false);
  });

  it("refuse d'affecter une personne sans le droit, en le disant, sans rien écrire", async () => {
    const counter = await staffWithRole(ctx, "vendeur", "comptoir", "comptoir");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    const refused = await assignDriver(roundId, counter.id, 409);

    expect(messageOf(refused)).toContain("Conduire sa tournée");
    expect((await roundOf(ctx, DAY, roundId)).driver).toBeNull();
  });

  it("retire le livreur, et trace les deux gestes au journal", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    await assignDriver(roundId, paul.id);
    const { version } = await roundOf(ctx, DAY, roundId);

    await admin(ctx).post(`${ROUNDS}/${roundId}/livreur/retrait`).send({ version }).expect(204);

    expect((await roundOf(ctx, DAY, roundId)).driver).toBeNull();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: roundId, type: { startsWith: "delivery_round.driver" } },
      orderBy: { occurredAt: "asc" },
      select: { type: true },
    });
    expect(facts.map((entry) => entry.type)).toEqual([
      "delivery_round.driver_assigned",
      "delivery_round.driver_unassigned",
    ]);
  });

  it("la porte du chargeur reste ouverte à une tournée sans livreur (MT-Q5)", async () => {
    const { roundId } = await roundWithStop("Kangoo", true);

    expect((await depart(ctx, roundId)).status).toBe(204);
  });
});

describe("le mur du livreur, dans la requête (MT-D3)", () => {
  it("chacun ne voit que SA tournée : l'autre est absente de la liste, 404 au détail et au départ", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId } = await roundWithStop("Kangoo", true);
    await assignDriver(roundId, paul.id);

    const mine = jsonBody<MyDeliveryRoundsView>(
      await paul.agent.get(`${MY_ROUND}?date=${DAY}`).expect(200),
    );
    expect(mine.rounds.map((round) => round.id)).toEqual([roundId]);

    const theirs = jsonBody<MyDeliveryRoundsView>(
      await lea.agent.get(`${MY_ROUND}?date=${DAY}`).expect(200),
    );
    expect(theirs.rounds).toEqual([]);
    await lea.agent.get(`${MY_ROUND}/${roundId}`).expect(404);
    await lea.agent.post(`${MY_ROUND}/${roundId}/depart`).send({ version: 2 }).expect(404);
    expect((await roundOf(ctx, DAY, roundId)).departedAt).toBeNull();
  });

  it("l'admin, qui tient le droit, n'y voit que ce qui lui est affecté", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await roundWithStop("Kangoo", false);
    await assignDriver(roundId, paul.id);

    const view = jsonBody<MyDeliveryRoundsView>(
      await admin(ctx).get(`${MY_ROUND}?date=${DAY}`).expect(200),
    );
    expect(view.rounds).toEqual([]);
    await admin(ctx).get(`${MY_ROUND}/${roundId}`).expect(404);
  });
});

describe("« Commencer ma tournée » (MT3)", () => {
  it("un bac non chargé : refusé avec la phrase du livreur, rien ne part", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await roundWithStop("Kangoo", false);
    await assignDriver(roundId, paul.id);
    const { version } = await myRound(paul.agent, roundId);

    const refused = await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version })
      .expect(409);

    expect(messageOf(refused)).toMatch(
      /n'est pas chargé \(Maison 1 \(TRN-0001\)\) — appelez le dépôt/u,
    );
    expect(await ctx.prisma.deliveryStopExecution.count()).toBe(0);
  });

  it("une version périmée : « modifiée au dépôt — rechargez la page »", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await roundWithStop("Kangoo", true);
    await assignDriver(roundId, paul.id);

    const refused = await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version: 1 })
      .expect(409);

    expect(messageOf(refused)).toMatch(/modifiée au dépôt .* — rechargez la page/u);
  });

  it("part, fige le rang et le point GPS, et la vue suit l'instantané — sans un sou", async () => {
    await seedDeparture(ctx);
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId } = await roundWithStop("Kangoo", true);
    await assignDriver(roundId, paul.id);
    const before = await myRound(paul.agent, roundId);
    expect(before).toMatchObject({ freeze: "live", departedAt: null });
    expect(before.stops[0]).toMatchObject({ rank: 1, gps: POINT, bins: 1, coldBins: 0 });

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version: before.version })
      .expect(204);

    const frozen = await ctx.prisma.deliveryStopExecution.findFirstOrThrow({
      where: { orderId },
      select: { departureRank: true, gpsLat: true, gpsLng: true },
    });
    expect(frozen).toEqual({ departureRank: 1, gpsLat: POINT.lat, gpsLng: POINT.lng });

    // Le carnet corrigé en route ne change pas le point promis.
    await ctx.prisma.address.updateMany({
      data: {
        deliverySpecs: {
          note: "",
          slots: { mode: "everyday", slot: null },
          deliveryContact: null,
          gps: { lat: 1, lng: 1 },
          signatureRequired: null,
        },
      },
    });
    const after = await myRound(paul.agent, roundId);
    expect(after).toMatchObject({ freeze: "departure" });
    expect(after.departedAt).not.toBeNull();
    expect(after.stops[0]).toMatchObject({ rank: 1, gps: POINT, reference: "TRN-0001" });
    expect(after.home?.label).toBe("Laboratoire");
    expect(JSON.stringify(after)).not.toMatch(/cents|price|total|amount|prix|montant/iu);

    const again = await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version: after.version })
      .expect(409);
    expect(messageOf(again)).toContain("déjà partie");
  });

  it("le départ par le chargeur fige aussi le rang et le point", async () => {
    const { roundId, orderId } = await roundWithStop("Kangoo", true);

    expect((await depart(ctx, roundId)).status).toBe(204);

    const frozen = await ctx.prisma.deliveryStopExecution.findFirstOrThrow({
      where: { orderId },
      select: { departureRank: true, gpsLat: true },
    });
    expect(frozen).toEqual({ departureRank: 1, gpsLat: POINT.lat });
  });
});
