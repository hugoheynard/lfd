/**
 * E2E **le commercial décide** (`documentation/livraisons/livreur/a-la-porte.md`,
 * § 10 B3, § 10 bis, LB-Q2, LB-Q5).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 * - un signalement « personne » OUVRE une décision, que la liste « À décider »
 *   montre à qui tient « Décider à la porte » (`delivery_decisions`, sorti de
 *   `b2b_companies` le 2026-10-02) — et à lui seul ;
 * - « Autoriser » ouvre « Déposé avec preuve » MÊME signature exigée (LB-Q5),
 *   sans faire bouger la version que présente le livreur ;
 * - « Rapporter » CLÔT l'arrêt sans livrer : la commande sort de l'index des
 *   arrêts vivants, peut repartir dans une autre tournée, et le retrait
 *   l'apprend revenue (le contrôle qualité la reprend) ;
 * - les courses : décision refusée sur un arrêt clos ou une tournée rentrée,
 *   dépôt refusé une fois rapportée.
 */
import type { MyDeliveryRoundView, PendingStopDecisionsView } from "@lfd/contracts";
import type request from "supertest";
import type { Response } from "supertest";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import {
  departedStop,
  DOOR_DAY,
  DOOR_ROLE,
  JPEG,
  myRound,
  orderStatus,
} from "./delivery-handover-scene.js";
import {
  addVehicle,
  admin,
  ADMIN_VERIFIER_OVERRIDE,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
} from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const DECIDE = "/admin/livraison/a-decider";

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

/** Un livreur parti, son arrêt signé (figé au départ), et une commerciale de la graine. */
async function scene(signatureRequired = true) {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const lea = await staffWithRole(ctx, "commerciale-lea", "commercial");
  const stop = await departedStop(ctx, paul);
  await ctx.prisma.deliveryStopExecution.update({
    where: { stopId: stop.stopId },
    data: { signatureRequired, depositAllowed: false },
  });
  return { paul, lea, ...stop };
}

async function reportNobody(agent: request.Agent, roundId: string, stopId: string): Promise<void> {
  await agent
    .post(`${MY_ROUND}/${roundId}/incidents`)
    .field("family", "doorstep")
    .field("reason", "nobody_present")
    .field("note", "")
    .field("stopId", stopId)
    .expect(201);
}

async function pending(agent: request.Agent): Promise<PendingStopDecisionsView> {
  return jsonBody<PendingStopDecisionsView>(await agent.get(DECIDE).expect(200));
}

async function deposit(agent: request.Agent, roundId: string, stopId: string): Promise<Response> {
  const version = (await myRound(agent, roundId)).version;
  return agent
    .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/depot`)
    .field("version", String(version))
    .attach("photo", JPEG, "depot.jpg");
}

function stopOf(view: MyDeliveryRoundView): MyDeliveryRoundView["stops"][number] | undefined {
  return view.stops[0];
}

describe("« À décider » — le commercial décide (B3)", () => {
  it("🔴 « personne » ouvre une décision ; « Autoriser » ouvre le dépôt MÊME signature exigée (LB-Q5)", async () => {
    const { paul, lea, roundId, orderId, stopId } = await scene();
    await reportNobody(paul.agent, roundId, stopId);

    const listed = await pending(lea.agent);
    expect(listed.decisions).toEqual([
      expect.objectContaining({
        stopId,
        orderId,
        signatureRequired: true,
        decision: { state: "pending", source: null, decidedAt: null, decidedByName: null },
        incidents: [expect.objectContaining({ reason: "nobody_present" })],
      }),
    ]);
    const before = await myRound(paul.agent, roundId);
    expect(stopOf(before)).toMatchObject({ canDeposit: false, decision: { state: "pending" } });

    await lea.agent.post(`${DECIDE}/${stopId}/autoriser-depot`).expect(204);

    const after = await myRound(paul.agent, roundId);
    expect(after.version).toBe(before.version);
    expect(stopOf(after)).toMatchObject({
      canDeposit: true,
      decision: {
        state: "authorize_deposit",
        source: "staff",
        decidedByName: "commerciale-lea Test",
      },
    });
    expect((await deposit(paul.agent, roundId, stopId)).status).toBe(204);
    await ctx.drain();
    const handover = await ctx.prisma.orderHandover.findUniqueOrThrow({ where: { orderId } });
    expect(handover.handedOverVia).toBe("deposit");
    expect(await orderStatus(ctx, orderId)).toBe("fulfilled");
    expect((await pending(lea.agent)).decisions).toEqual([]);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_deposit_authorized" },
      }),
    ).toBe(1);
  });

  it("🔴 « Rapporter » clôt l'arrêt sans livrer ; la commande repart dans une autre tournée et redevient contrôlable", async () => {
    const { paul, lea, roundId, orderId, stopId } = await scene();
    await reportNobody(paul.agent, roundId, stopId);

    await lea.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(204);
    await ctx.drain();

    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).not.toBeNull();
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
    expect(await orderStatus(ctx, orderId)).not.toBe("fulfilled");
    const departure = await ctx.prisma.orderDeparture.findUniqueOrThrow({ where: { orderId } });
    expect(departure.returnedAt).not.toBeNull();
    expect(stopOf(await myRound(paul.agent, roundId))).toMatchObject({
      decision: { state: "bring_back" },
    });
    // Sortie de l'index des arrêts vivants : une autre tournée la prend.
    const other = await openRound(ctx, DOOR_DAY, await addVehicle(ctx, "Trafic"));
    await assign(ctx, DOOR_DAY, other, orderId);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_brought_back" },
      }),
    ).toBe(1);
  });

  it("🔴 « Autoriser » puis « Rapporter » : la dernière l'emporte, et le dépôt est refusé en le disant", async () => {
    const { paul, lea, roundId, orderId, stopId } = await scene(false);
    await reportNobody(paul.agent, roundId, stopId);
    await lea.agent.post(`${DECIDE}/${stopId}/autoriser-depot`).expect(204);

    await lea.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(204);

    const refused = await deposit(paul.agent, roundId, stopId);
    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toMatch(/décidé de rapporter/u);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
    const decision = await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } });
    expect(decision).toMatchObject({ outcome: "bring_back", version: 3 });
  });

  it("🔴 décision refusée sur un arrêt déjà déposé", async () => {
    const { paul, lea, roundId, stopId } = await scene(false);
    await ctx.prisma.deliveryStopExecution.update({
      where: { stopId },
      data: { depositAllowed: true },
    });
    await reportNobody(paul.agent, roundId, stopId);
    expect((await deposit(paul.agent, roundId, stopId)).status).toBe(204);

    const closed = await lea.agent.post(`${DECIDE}/${stopId}/rapporter`);
    expect(closed.status).toBe(409);
    expect(messageOf(closed)).toMatch(/déjà clos/u);
  });

  it("🔴 décision refusée sur une tournée rentrée", async () => {
    const { paul, lea, roundId, stopId } = await scene(false);
    await reportNobody(paul.agent, roundId, stopId);
    // Le livreur ne peut plus terminer avec un arrêt en attente (B4) : la rentrée staff le peut.
    await admin(ctx).post(`${ROUNDS}/${roundId}/retour`).expect(204);

    const returned = await lea.agent.post(`${DECIDE}/${stopId}/autoriser-depot`);

    expect(returned.status).toBe(409);
    expect(messageOf(returned)).toMatch(/est rentrée/u);
  });

  it("🔴 le droit : un livreur et une comptable n'ont ni la liste, ni les réponses", async () => {
    const { paul, roundId, stopId } = await scene();
    const compta = await staffWithRole(ctx, "compta-ines", "comptabilite");
    await reportNobody(paul.agent, roundId, stopId);

    await paul.agent.get(DECIDE).expect(403);
    await compta.agent.get(DECIDE).expect(403);
    await compta.agent.post(`${DECIDE}/${stopId}/autoriser-depot`).expect(403);
    await paul.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(403);
    expect(
      await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ outcome: null });
  });

  /**
   * 2026-10-02 : « À décider » a quitté `b2b_companies:write`. Gérer les
   * comptes n'ouvre plus rien ici ; la lecture voit la liste et la photo,
   * l'écriture seule répond.
   */
  it("🔴 le droit est « Décider à la porte » : comptes seuls → 403 ; lecture → la liste sans réponse ; écriture → décide", async () => {
    const { paul, roundId, stopId } = await scene();
    const admin = ctx.asSub(E2E_STAFF_SUB);
    for (const role of [
      {
        key: "decideur",
        label: "Décideur",
        grants: [{ resource: "delivery_decisions", action: "write" }],
      },
      {
        key: "lecteur-porte",
        label: "Lecteur",
        grants: [{ resource: "delivery_decisions", action: "read" }],
      },
      {
        key: "comptes-seuls",
        label: "Comptes",
        grants: [{ resource: "b2b_companies", action: "write" }],
      },
    ]) {
      await admin.post("/admin/staff-roles").send(role).expect(201);
    }
    const decider = await staffWithRole(ctx, "decideur-zoe", "decideur");
    const reader = await staffWithRole(ctx, "lecteur-max", "lecteur-porte");
    const accounts = await staffWithRole(ctx, "comptes-ana", "comptes-seuls");
    await reportNobody(paul.agent, roundId, stopId);

    await accounts.agent.get(DECIDE).expect(403);
    await accounts.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(403);
    expect((await pending(reader.agent)).decisions).toHaveLength(1);
    await reader.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(403);
    await decider.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(204);
    expect(
      await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ outcome: "bring_back" });
  });

  it("un arrêt sans signalement n'a pas de décision : 404 nommé", async () => {
    const { lea, stopId } = await scene();

    const missing = await lea.agent.post(`${DECIDE}/${stopId}/autoriser-depot`);

    expect(missing.status).toBe(404);
    expect(messageOf(missing)).toMatch(/Aucune décision/u);
  });

  /** Un signalement AVEC photo ; rend son id. */
  async function reportWithPhoto(
    agent: request.Agent,
    roundId: string,
    stopId: string,
    family: "doorstep" | "technical",
    reason: string,
  ): Promise<string> {
    const response = await agent
      .post(`${MY_ROUND}/${roundId}/incidents`)
      .field("family", family)
      .field("reason", reason)
      .field("note", "")
      .field("stopId", stopId)
      .attach("photo", JPEG, "porte.jpg")
      .expect(201);
    return jsonBody<{ id: string }>(response).id;
  }

  it("🔴 la photo d'un signalement à décider : lue par le commercial ; 404 sans décision vivante ; 403 sans le droit", async () => {
    const { paul, lea, roundId, stopId } = await scene();
    const compta = await staffWithRole(ctx, "compta-ines", "comptabilite");
    const technical = await reportWithPhoto(
      paul.agent,
      roundId,
      stopId,
      "technical",
      "cold_failure",
    );
    // Un problème technique n'ouvre pas de décision : sa photo n'est pas servie ici.
    await lea.agent.get(`${DECIDE}/${stopId}/incidents/${technical}/photo`).expect(404);

    const nobody = await reportWithPhoto(paul.agent, roundId, stopId, "doorstep", "nobody_present");
    const photo = await lea.agent.get(`${DECIDE}/${stopId}/incidents/${nobody}/photo`).expect(200);
    expect(photo.headers["content-type"]).toMatch(/image\/jpeg/u);
    await compta.agent.get(`${DECIDE}/${stopId}/incidents/${nobody}/photo`).expect(403);
    await paul.agent.get(`${DECIDE}/${stopId}/incidents/${nobody}/photo`).expect(403);

    // Rapportée, la décision n'est plus vivante : la photo ne se sert plus ici.
    await lea.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(204);
    await lea.agent.get(`${DECIDE}/${stopId}/incidents/${nobody}/photo`).expect(404);
  });
});
