/**
 * E2E **« Remis au client »** (`documentation/livraisons/a-la-porte.md`,
 * B1, § 9, § 10 bis, AP-D1).
 *
 * Ce que seule cette suite prouve : le canal `delivery/channels/handover/` est
 * relié par la racine de composition, l'attestation et la clôture de l'arrêt
 * tiennent dans UNE transaction, le commerce n'apprend la remise qu'APRÈS sa
 * validation (la commande `fulfilled`), et une validation qui échoue ne laisse
 * ni commande `fulfilled`, ni point, ni pièce.
 */
import type request from "supertest";
import type { Response } from "supertest";

import { PrismaService } from "../src/platform/database/prisma.service.js";
import { currentTransaction } from "../src/platform/database/transaction.store.js";
import { PrismaUnitOfWork, UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStop as departedStopOf,
  type DepartedStop,
  type DoorDriver,
  DOOR_ROLE,
  JPEG,
  myRound,
  orderStatus as orderStatusOf,
  PNG,
} from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/**
 * La vraie unité de travail, que le test fait échouer APRÈS le travail de
 * l'unité la plus externe — la mécanique de `handover-departure-custody`.
 */
class FailableUnitOfWork extends UnitOfWork {
  inner: UnitOfWork | null = null;
  failNextCommit = false;

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.inner === null) {
      throw new RangeError("unité de travail e2e non branchée");
    }
    if (currentTransaction() !== undefined) {
      return this.inner.run(work);
    }
    return this.inner.run(async () => {
      const result = await work();
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new RangeError("validation refusée (e2e)");
      }
      return result;
    });
  }
}
const unitOfWork = new FailableUnitOfWork();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: UnitOfWork, value: unitOfWork }],
  });
  unitOfWork.inner = new PrismaUnitOfWork(ctx.app.get(PrismaService));
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

type Agent = request.Agent;

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

function departedStop(driver: DoorDriver): Promise<DepartedStop> {
  return departedStopOf(ctx, driver);
}

async function handOver(
  agent: Agent,
  roundId: string,
  stopId: string,
  pieces: { readonly photo?: boolean; readonly signature?: boolean; readonly name?: string } = {},
): Promise<Response> {
  const version = (await myRound(agent, roundId)).version;
  let call = agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
    .field("version", String(version))
    .field("receiverName", pieces.name ?? "Mme Durand");
  if (pieces.photo ?? true) {
    call = call.attach("photo", JPEG, "remise.jpg");
  }
  if (pieces.signature ?? false) {
    call = call.attach("signature", PNG, "signature.png");
  }
  return call;
}

function orderStatus(orderId: string): Promise<string> {
  return orderStatusOf(ctx, orderId);
}

describe("« Remis au client » (B1)", () => {
  it("atteste avec ses pièces, clôt l'arrêt, journalise ; le commerce passe la commande `fulfilled`", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(paul);

    expect((await handOver(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const handover = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });
    expect(handover).toMatchObject({ handedOverBy: paul.id, handedOverVia: "manual" });
    const proof = await ctx.prisma.orderHandoverProof.findUniqueOrThrow({ where: { orderId } });
    expect(proof).toMatchObject({ receiverName: "Mme Durand", signatureKey: null });
    const store = ctx.app.get(ProductionDocumentStore);
    expect(await store.readIfPresent(proof.photoKey)).toEqual(JPEG);
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).not.toBeNull();
    expect(await orderStatus(orderId)).toBe("fulfilled");
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_handed_over" },
      }),
    ).toBe(1);
  });

  it("🔴 AP-D1 : la validation échoue — ni attestation, ni commande `fulfilled`, ni point, ni pièce", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(paul);
    unitOfWork.failNextCommit = true;

    expect((await handOver(paul.agent, roundId, stopId)).status).toBe(500);
    await ctx.drain();

    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
    expect(await ctx.prisma.orderHandoverProof.count({ where: { orderId } })).toBe(0);
    expect(await orderStatus(orderId)).not.toBe("fulfilled");
    expect(await ctx.prisma.loyaltyLedgerEntry.count()).toBe(0);
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).toBeNull();
  });

  it("🔴 rejouée sur l'arrêt remis : 204 « déjà fait », rien de réécrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(paul);
    expect((await handOver(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();
    const first = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });

    expect((await handOver(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();

    const again = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });
    expect(again.handedOverAt).toEqual(first.handedOverAt);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_handed_over" },
      }),
    ).toBe(1);
  });

  it("🔴 rejouée sur un arrêt clos SANS remise : refus nommé", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(paul);
    await ctx.prisma.order.update({ where: { id: orderId }, data: { status: "cancelled" } });
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version: (await myRound(paul.agent, roundId)).version })
      .expect(204);

    const refused = await handOver(paul.agent, roundId, stopId);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toMatch(/a été clos sans remise/u);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
  });

  it("refuse sans photo, et sans la signature exigée au départ", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(paul);

    const noPhoto = await handOver(paul.agent, roundId, stopId, { photo: false });
    expect(noPhoto.status).toBe(400);
    expect(messageOf(noPhoto)).toMatch(/toujours une photo/u);

    await ctx.prisma.deliveryStopExecution.update({
      where: { stopId },
      data: { signatureRequired: true },
    });
    const unsigned = await handOver(paul.agent, roundId, stopId);
    expect(unsigned.status).toBe(400);
    expect(messageOf(unsigned)).toMatch(/exige une signature/u);

    expect((await handOver(paul.agent, roundId, stopId, { signature: true })).status).toBe(204);
    const proof = await ctx.prisma.orderHandoverProof.findUniqueOrThrow({ where: { orderId } });
    expect(proof.signatureKey).not.toBeNull();
  });

  it("🔴 le mur : un autre livreur prend 404, et rien ne s'écrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderId, stopId } = await departedStop(paul);
    const version = (await myRound(paul.agent, roundId)).version;

    await lea.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
      .field("version", String(version))
      .field("receiverName", "Mme Durand")
      .attach("photo", JPEG, "remise.jpg")
      .expect(404);

    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
  });
});
