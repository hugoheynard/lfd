/**
 * E2E **voir les preuves de livraison** (`documentation/livraisons/a-la-porte.md`,
 * § 10, lot « voir les preuves ») — la carte de la fiche commande, et ses images.
 *
 * Ce que seule cette suite prouve : le commerce lit les pièces par le canal
 * que le retrait publie (relié par la racine de composition), les images se
 * retrouvent par la COMMANDE dans le vrai stockage de test, et le droit
 * `delivery_proofs:read` tient la porte (`b2b_orders:read` jusqu'au 2026-10-02).
 */
import { CommandBus } from "@nestjs/cqrs";
import type { OrderHandoverProofResponse } from "@lfd/contracts";
import type request from "supertest";
import type { Response } from "supertest";

import { EraseHandoverProofsCommand } from "../src/handover/application/commands/erase-handover-proofs.command.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStop,
  DOOR_DAY,
  DOOR_ROLE,
  JPEG,
  myRound,
  PNG,
} from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene, seedLocatedDelivery } from "./delivery-routing-scene.js";
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

function proofUrl(orderId: string): string {
  return `/admin/orders/${orderId}/preuve-livraison`;
}

async function proofOf(orderId: string): Promise<OrderHandoverProofResponse> {
  return jsonBody<OrderHandoverProofResponse>(
    await ctx.asSub(E2E_STAFF_SUB).get(proofUrl(orderId)).expect(200),
  );
}

function imageOf(orderId: string, piece: "photo" | "signature"): request.Test {
  return ctx
    .asSub(E2E_STAFF_SUB)
    .get(`${proofUrl(orderId)}/${piece}`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

async function handOverSigned(
  agent: request.Agent,
  roundId: string,
  stopId: string,
): Promise<Response> {
  const version = (await myRound(agent, roundId)).version;
  return agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
    .field("version", String(version))
    .field("receiverName", "Mme Durand")
    .attach("photo", JPEG, "remise.jpg")
    .attach("signature", PNG, "signature.png");
}

async function deposited(agent: request.Agent, roundId: string, stopId: string): Promise<Response> {
  await ctx.prisma.deliveryStopExecution.update({
    where: { stopId },
    data: { depositAllowed: true },
  });
  const version = (await myRound(agent, roundId)).version;
  return agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/depot`)
    .field("version", String(version))
    .attach("photo", JPEG, "depot.jpg");
}

describe("La preuve de livraison sur la fiche commande", () => {
  it("une remise en main propre montre le nom, le livreur, la photo et la signature", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await handOverSigned(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const { proof } = await proofOf(orderId);
    expect(proof).toMatchObject({
      mode: "handed",
      courierName: "livreur-paul Test",
      pieces: { receiverName: "Mme Durand", hasSignature: true },
    });
    expect(JSON.stringify(proof)).not.toContain(paul.id);
    expect(JSON.stringify(proof)).not.toContain("handover/proofs");

    const photo = await imageOf(orderId, "photo").expect(200);
    expect(photo.headers["content-type"]).toContain("image/jpeg");
    expect(photo.headers["cache-control"]).toContain("no-store");
    expect(photo.body).toEqual(JPEG);
    const signature = await imageOf(orderId, "signature").expect(200);
    expect(signature.headers["content-type"]).toContain("image/png");
    expect(signature.body).toEqual(PNG);
  });

  it("un dépôt n'a ni nom ni signature", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await deposited(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const { proof } = await proofOf(orderId);
    expect(proof).toMatchObject({
      mode: "deposited",
      pieces: { receiverName: null, hasSignature: false },
    });
    await imageOf(orderId, "photo").expect(200);
    await imageOf(orderId, "signature").expect(404);
  });

  it("🔴 la photo d'une commande sans preuve est un 404 — jamais celle d'une autre", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await handOverSigned(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();
    const other = await seedLocatedDelivery(ctx, DOOR_DAY, { lat: 45.7, lng: 6.2 });

    expect(other).not.toBe(orderId);
    await imageOf(other, "photo").expect(404);
    await imageOf(other, "signature").expect(404);
  });

  it("une commande sans preuve rend `proof: null`", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { orderId } = await departedStop(ctx, paul);

    expect(await proofOf(orderId)).toEqual({ proof: null });
  });

  it("des pièces effacées laissent la remise, marquée sans pièce", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await handOverSigned(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();
    await ctx.app.get(CommandBus).execute(new EraseHandoverProofsCommand(orderId));

    const { proof } = await proofOf(orderId);
    expect(proof).toMatchObject({ mode: "handed", pieces: null });
    await imageOf(orderId, "photo").expect(404);
  });

  it("sans aucun droit : 403, carte et images", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await handOverSigned(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    await paul.agent.get(proofUrl(orderId)).expect(403);
    await paul.agent.get(`${proofUrl(orderId)}/photo`).expect(403);
    await paul.agent.get(`${proofUrl(orderId)}/signature`).expect(403);
  });

  /**
   * 2026-10-02 : la preuve a quitté `b2b_orders:read`. Voir les commandes ne
   * la montre plus ; « Preuves de livraison » en lecture la montre, seul.
   */
  it("🔴 `b2b_orders:read` seul → 403 ; `delivery_proofs:read` seul → 200, carte et images", async () => {
    const admin = ctx.asSub(E2E_STAFF_SUB);
    await admin
      .post("/admin/staff-roles")
      .send({
        key: "commandes-seules",
        label: "Commandes",
        grants: [{ resource: "b2b_orders", action: "read" }],
      })
      .expect(201);
    await admin
      .post("/admin/staff-roles")
      .send({
        key: "preuves",
        label: "Preuves",
        grants: [{ resource: "delivery_proofs", action: "read" }],
      })
      .expect(201);
    const orders = await staffWithRole(ctx, "commandes-ana", "commandes-seules");
    const proofs = await staffWithRole(ctx, "preuves-max", "preuves");
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    expect((await handOverSigned(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    await orders.agent.get(proofUrl(orderId)).expect(403);
    await orders.agent.get(`${proofUrl(orderId)}/photo`).expect(403);
    await orders.agent.get(`${proofUrl(orderId)}/signature`).expect(403);
    await proofs.agent.get(proofUrl(orderId)).expect(200);
    await proofs.agent.get(`${proofUrl(orderId)}/photo`).expect(200);
    await proofs.agent.get(`${proofUrl(orderId)}/signature`).expect(200);
  });
});
