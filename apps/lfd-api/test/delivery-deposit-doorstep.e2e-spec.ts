/**
 * E2E **« Déposé avec preuve »** (`documentation/livraisons/a-la-porte.md`,
 * B2, AP-Q5, AP-Q6, AP-D5, AP-D8).
 *
 * Ce que seule cette suite prouve : la permission se lit sur l'exécution FIGÉE
 * au départ (dépôt autorisé, signature exigée), le retrait grave `deposit` sans
 * nom de réceptionnaire, et le commerce en tire les mêmes effets qu'une remise
 * (la commande `fulfilled`, après validation).
 */
import type request from "supertest";
import type { Response } from "supertest";

import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import { departedStop, DOOR_ROLE, JPEG, myRound, orderStatus } from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

/** Ce que le client avait réglé au départ — la valeur figée que le dépôt lit (AP-D5). */
async function frozeAtDeparture(
  stopId: string,
  frozen: { readonly depositAllowed: boolean; readonly signatureRequired?: boolean },
): Promise<void> {
  await ctx.prisma.deliveryStopExecution.update({ where: { stopId }, data: frozen });
}

async function deposit(
  agent: request.Agent,
  roundId: string,
  stopId: string,
  withPhoto = true,
): Promise<Response> {
  const version = (await myRound(agent, roundId)).version;
  const call = agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/depot`)
    .field("version", String(version));
  return withPhoto ? call.attach("photo", JPEG, "depot.jpg") : call;
}

function depositFacts(roundId: string): Promise<number> {
  return ctx.prisma.activityEvent.count({
    where: { subjectId: roundId, type: "delivery_round.stop_deposited" },
  });
}

describe("« Déposé avec preuve » (B2)", () => {
  it("atteste `deposit` avec la photo, sans nom ; clôt l'arrêt ; la commande passe `fulfilled`", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    await frozeAtDeparture(stopId, { depositAllowed: true });
    expect((await myRound(paul.agent, roundId)).stops[0]?.canDeposit).toBe(true);

    expect((await deposit(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const handover = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });
    expect(handover).toMatchObject({ handedOverBy: paul.id, handedOverVia: "deposit" });
    const proof = await ctx.prisma.orderHandoverProof.findUniqueOrThrow({ where: { orderId } });
    expect(proof).toMatchObject({ receiverName: null, signatureKey: null });
    expect(await ctx.app.get(ProductionDocumentStore).readIfPresent(proof.photoKey)).toEqual(JPEG);
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).not.toBeNull();
    expect(await orderStatus(ctx, orderId)).toBe("fulfilled");
    expect(await depositFacts(roundId)).toBe(1);
  });

  it("🔴 refusé quand le client n'a pas autorisé le dépôt — rien ne s'écrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);

    const refused = await deposit(paul.agent, roundId, stopId);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toMatch(/n'autorise pas le dépôt/u);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
    expect(await orderStatus(ctx, orderId)).not.toBe("fulfilled");
  });

  it("🔴 refusé quand la signature est exigée, même dépôt autorisé (AP-Q6)", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    await frozeAtDeparture(stopId, { depositAllowed: true, signatureRequired: true });
    expect((await myRound(paul.agent, roundId)).stops[0]?.canDeposit).toBe(false);

    const refused = await deposit(paul.agent, roundId, stopId);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toMatch(/exige une signature : elle ne se dépose pas/u);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
  });

  it("refusé sans photo", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stopId } = await departedStop(ctx, paul);
    await frozeAtDeparture(stopId, { depositAllowed: true });

    const refused = await deposit(paul.agent, roundId, stopId, false);

    expect(refused.status).toBe(400);
    expect(messageOf(refused)).toMatch(/toujours une photo/u);
  });

  it("🔴 rejoué sur l'arrêt déposé : 204 « déjà fait », rien de réécrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    await frozeAtDeparture(stopId, { depositAllowed: true });
    expect((await deposit(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();
    const first = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });

    expect((await deposit(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const again = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });
    expect(again.handedOverAt).toEqual(first.handedOverAt);
    expect(await depositFacts(roundId)).toBe(1);
  });

  it("🔴 le mur : un autre livreur prend 404, et rien ne s'écrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    await frozeAtDeparture(stopId, { depositAllowed: true });
    const version = (await myRound(paul.agent, roundId)).version;

    await lea.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/depot`)
      .field("version", String(version))
      .attach("photo", JPEG, "depot.jpg")
      .expect(404);

    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
  });
});
