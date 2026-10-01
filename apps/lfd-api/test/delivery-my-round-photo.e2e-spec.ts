/**
 * E2E de la **photo d'une étape, ouverte par le livreur**
 * (`documentation/livraisons/plan-ma-tournee.md`, MT-D5 v2) — sur un vrai
 * Postgres et un vrai MinIO.
 *
 * Ce que seuls le vrai SQL et le vrai stockage prouvent : que la photo
 * déposée par la route du staff revient octet pour octet par la route du
 * livreur, avec les mêmes en-têtes ; que le mur du livreur tient (404 sur la
 * tournée d'un autre) ; qu'une étape d'une autre adresse ne sort pas par
 * l'arrêt de ma tournée (404) ; et qu'un staff sans `delivery_driving` prend
 * 403.
 */
import type { CreatedDeliveryStepResponse, MyDeliveryRoundView } from "@lfd/contracts";
import type request from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
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
import { forgetRoutingScene, seedLocatedDelivery } from "./delivery-routing-scene.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";
import { photoOf, pngOf } from "./delivery-procedure-scene.js";

const DAY = serviceDay();
const POINT = { lat: 45.6, lng: 6.1 };
const PORTAIL = pngOf(40, 30);

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

/** Pose une étape avec photo sur l'adresse de la commande, par la route du staff. */
async function addPhotoStep(orderId: string): Promise<string> {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { companyId: true, deliveryAddressId: true },
  });
  const base = `/admin/companies/${order.companyId ?? ""}/delivery-addresses/${order.deliveryAddressId ?? ""}/procedure`;
  const response = await admin(ctx)
    .post(`${base}/steps`)
    .field("title", "Le portail")
    .field("body", "")
    .attach("photo", PORTAIL, "porte.png")
    .expect(201);
  return jsonBody<CreatedDeliveryStepResponse>(response).id;
}

/** Une tournée d'un arrêt situé, affectée à `driverId` ; rend la tournée et sa commande. */
async function myRoundWithStop(
  driverId: string,
): Promise<{ readonly roundId: string; readonly orderId: string }> {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  const orderId = await seedLocatedDelivery(ctx, DAY, POINT);
  await assign(ctx, DAY, roundId, orderId);
  const { version } = await roundOf(ctx, DAY, roundId);
  await admin(ctx)
    .put(`${ROUNDS}/${roundId}/livreur`)
    .send({ staffUserId: driverId, version })
    .expect(204);
  return { roundId, orderId };
}

async function stopIdOf(agent: request.Agent, roundId: string): Promise<string> {
  const view = jsonBody<MyDeliveryRoundView>(await agent.get(`${MY_ROUND}/${roundId}`).expect(200));
  return view.stops[0]?.stopId ?? "";
}

function photoUrl(roundId: string, stopId: string, stepId: string): string {
  return `${MY_ROUND}/${roundId}/arrets/${stopId}/procedure/${stepId}/photo`;
}

describe("la photo d'une étape, pour le livreur (MT-D5 v2)", () => {
  it("sert la photo de l'arrêt de SA tournée, avec les en-têtes de la route du staff", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId } = await myRoundWithStop(paul.id);
    const stepId = await addPhotoStep(orderId);
    const view = jsonBody<MyDeliveryRoundView>(
      await paul.agent.get(`${MY_ROUND}/${roundId}`).expect(200),
    );
    const stop = view.stops[0];
    expect(stop?.procedure[0]).toMatchObject({ id: stepId, hasPhoto: true });

    const served = await photoOf(paul.agent, photoUrl(roundId, stop?.stopId ?? "", stepId));

    expect(Buffer.compare(served.body as Buffer, PORTAIL)).toBe(0);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
  });

  it("la tournée d'un autre livreur : 404, même avec le bon arrêt et la bonne étape", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderId } = await myRoundWithStop(paul.id);
    const stepId = await addPhotoStep(orderId);
    const stopId = await stopIdOf(paul.agent, roundId);

    await lea.agent.get(photoUrl(roundId, stopId, stepId)).expect(404);
  });

  it("une étape d'une autre adresse ne sort pas par l'arrêt de ma tournée : 404", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await myRoundWithStop(paul.id);
    const elsewhere = await seedLocatedDelivery(ctx, DAY, POINT);
    const foreignStep = await addPhotoStep(elsewhere);
    const stopId = await stopIdOf(paul.agent, roundId);

    await paul.agent.get(photoUrl(roundId, stopId, foreignStep)).expect(404);
  });

  it("un staff sans le droit de conduire : 403", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const vendeur = await staffWithRole(ctx, "vendeur", "comptoir", "comptoir");
    const { roundId, orderId } = await myRoundWithStop(paul.id);
    const stepId = await addPhotoStep(orderId);
    const stopId = await stopIdOf(paul.agent, roundId);

    await vendeur.agent.get(photoUrl(roundId, stopId, stepId)).expect(403);
  });
});
