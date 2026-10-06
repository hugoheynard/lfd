/**
 * E2E de la **place suggérée** (composition automatique, CA7) : un jour
 * appliqué, un vrai retirage du fournil qui y ajoute des livraisons, la
 * suggestion lue par l'écran, puis « Placer ici » — l'affectation existante,
 * au rang suggéré, sous la version lue. Une suggestion périmée est refusée
 * (409) : le vrai `WHERE version = lue` ne se prouve qu'ici.
 */
import type {
  DeliveryPlacementSuggestionsView,
  DeliverySuggestedPlacementView,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
  roundOf,
  ROUNDS,
} from "./delivery-rounds-scene.js";
import {
  apply,
  forgetRoutingScene,
  MEASURED,
  payloadOf,
  propose,
  ROAD_ROUTING_OVERRIDES,
  seedBinCatalog,
  seedDeparture,
  seedPlannableDelivery,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();
const SUGGESTIONS = `${ROUNDS}/places-suggerees`;

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

async function suggestions(): Promise<DeliveryPlacementSuggestionsView> {
  return jsonBody<DeliveryPlacementSuggestionsView>(
    await admin(ctx).get(`${SUGGESTIONS}?jour=${DAY}`).expect(200),
  );
}

function suggested(
  view: DeliveryPlacementSuggestionsView,
  orderId: string,
): DeliverySuggestedPlacementView {
  const line = view.suggestions.find((candidate) => candidate.orderId === orderId);
  if (line?.status !== "suggested") {
    throw new TypeError(`aucune place suggérée pour ${orderId} : ${JSON.stringify(line)}`);
  }
  return line;
}

/** Le plan arrêté, deux livraisons au nord appliquées dans une tournée. */
async function appliedDay(): Promise<string> {
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
  await seedPlannableDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 });
  await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
  await apply(ctx, payloadOf(await propose(ctx, `jour=${DAY}`))).expect(204);
  const [round] = await ctx.prisma.deliveryRound.findMany({ where: { serviceDay: DAY } });
  if (round === undefined) {
    throw new TypeError("aucune tournée appliquée");
  }
  return round.id;
}

/** Des livraisons arrivées après l'arrêt, absorbées par un vrai retirage (CA6b). */
async function retakenWith(count: number): Promise<readonly string[]> {
  const late: string[] = [];
  for (let index = 0; index < count; index += 1) {
    late.push(await seedPlannableDelivery(ctx, DAY, { lat: 45.65 + index / 100, lng: 5.91 }));
  }
  await admin(ctx).post(`/admin/production/worksheet/${DAY}/retake`).expect(201);
  await ctx.drain();
  return late;
}

describe("la place suggérée d'une livraison arrivée sur un jour appliqué (CA7)", () => {
  it("le retirage ajoute une commande → place suggérée → « Placer ici » l'attache à ce rang", async () => {
    const roundId = await appliedDay();
    const [late = ""] = await retakenWith(1);

    const place = suggested(await suggestions(), late);
    expect(place).toMatchObject({ roundId, stopCount: 2 });
    expect(place.extraMinutes).toBeGreaterThanOrEqual(0);

    await admin(ctx)
      .post(`${ROUNDS}/${roundId}/arrets`)
      .send({ orderId: late, version: place.roundVersion, after: place.after })
      .expect(201);

    const stops = (await roundOf(ctx, DAY, roundId)).stops.map((stop) => stop.orderId);
    expect(stops).toHaveLength(3);
    expect(stops[place.after]).toBe(late);
    expect((await suggestions()).suggestions).toEqual([]);
  });

  it("une suggestion dont la tournée a bougé depuis est refusée (409), sans rien écrire", async () => {
    const roundId = await appliedDay();
    const [first = "", second = ""] = await retakenWith(2);
    const view = await suggestions();
    const one = suggested(view, first);
    const two = suggested(view, second);

    await admin(ctx)
      .post(`${ROUNDS}/${roundId}/arrets`)
      .send({ orderId: first, version: one.roundVersion, after: one.after })
      .expect(201);
    await admin(ctx)
      .post(`${ROUNDS}/${two.roundId}/arrets`)
      .send({ orderId: second, version: two.roundVersion, after: two.after })
      .expect(409);

    const stops = (await roundOf(ctx, DAY, roundId)).stops.map((stop) => stop.orderId);
    expect(stops).not.toContain(second);
  });

  it("refuse un rang que la tournée n'a pas (400), sans rien écrire", async () => {
    const roundId = await appliedDay();
    const [late = ""] = await retakenWith(1);
    const { version } = await roundOf(ctx, DAY, roundId);

    await admin(ctx)
      .post(`${ROUNDS}/${roundId}/arrets`)
      .send({ orderId: late, version, after: 5 })
      .expect(400);

    expect((await roundOf(ctx, DAY, roundId)).stops).toHaveLength(2);
  });

  it("sans tournée enregistrée, rien à suggérer ; un jour mal formé est refusé (400)", async () => {
    await seedDeparture(ctx);
    await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });

    expect(await suggestions()).toEqual({ day: DAY, suggestions: [] });
    await admin(ctx).get(`${SUGGESTIONS}?jour=demain`).expect(400);
  });
});
