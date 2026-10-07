/**
 * E2E **« Tournée terminée » exige un sort pour chaque arrêt**
 * (`documentation/livraisons/livreur/a-la-porte.md`, § 10 B4 ;
 * `parcours-du-livreur.md`, note du 2026-10-01).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 * - le livreur est refusé (409) tant qu'un arrêt est vivant — signalé ou en
 *   attente du commercial compris —, le refus NOMME l'arrêt, et rien ne
 *   s'écrit : ni retour, ni fait au journal ;
 * - remis au client, ou « Rapporter » du commercial, donnent un sort : la
 *   même demande passe alors ;
 * - la rentrée STAFF reste permise malgré un arrêt sans sort (sortie de
 *   secours, § 10 bis SÉRIEUX 4) : il paraît dans « Non remis ».
 */
import type { UndeliveredStopsView } from "@lfd/contracts";
import type request from "supertest";
import type { Response } from "supertest";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import { departedStop, DOOR_ROLE, JPEG, myRound } from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, forgetCustomer, ROUNDS } from "./delivery-rounds-scene.js";
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

function finish(agent: request.Agent, roundId: string): request.Test {
  return agent.post(`${MY_ROUND}/${roundId}/retour`);
}

async function returnedAt(roundId: string): Promise<Date | null> {
  const round = await ctx.prisma.deliveryRound.findUniqueOrThrow({
    where: { id: roundId },
    select: { returnedAt: true },
  });
  return round.returnedAt;
}

function returnFacts(roundId: string): Promise<number> {
  return ctx.prisma.activityEvent.count({
    where: { subjectId: roundId, type: "delivery_round.returned" },
  });
}

describe("« Tournée terminée » exige un sort pour chaque arrêt (B4)", () => {
  it("🔴 refus nommé tant que l'arrêt est ouvert ; remis au client, la même demande passe", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stopId } = await departedStop(ctx, paul);
    const before = await myRound(paul.agent, roundId);
    const reference = before.stops[0]?.reference ?? "";

    const refused = await finish(paul.agent, roundId).expect(409);

    expect(messageOf(refused)).toContain("un arrêt n'a pas de sort");
    expect(messageOf(refused)).toContain(reference);
    expect(await returnedAt(roundId)).toBeNull();
    expect(await returnFacts(roundId)).toBe(0);

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/remise`)
      .field("version", String(before.version))
      .field("receiverName", "Mme Durand")
      .attach("photo", JPEG, "remise.jpg")
      .expect(204);
    await finish(paul.agent, roundId).expect(204);

    expect(await returnedAt(roundId)).not.toBeNull();
    expect(await returnFacts(roundId)).toBe(1);
  });

  it("🔴 un arrêt signalé « personne », en attente du commercial, refuse ; « Rapporter » lui donne un sort", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "commerciale-lea", "commercial");
    const { roundId, stopId } = await departedStop(ctx, paul);
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/incidents`)
      .field("family", "doorstep")
      .field("reason", "nobody_present")
      .field("note", "")
      .field("stopId", stopId)
      .expect(201);

    const pending = await finish(paul.agent, roundId).expect(409);
    expect(messageOf(pending)).toContain("attendez la décision du commercial");

    await lea.agent.post(`${DECIDE}/${stopId}/rapporter`).expect(204);
    await finish(paul.agent, roundId).expect(204);

    expect(await returnedAt(roundId)).not.toBeNull();
  });

  it("la rentrée staff reste permise malgré un arrêt sans sort : il paraît dans « Non remis »", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, stopId } = await departedStop(ctx, paul);
    await finish(paul.agent, roundId).expect(409);

    await admin(ctx).post(`${ROUNDS}/${roundId}/retour`).expect(204);
    await finish(paul.agent, roundId).expect(204);

    const undelivered = jsonBody<UndeliveredStopsView>(
      await admin(ctx).get("/admin/livraison/non-remis").expect(200),
    );
    expect(undelivered.stops.map((stop) => stop.stopId)).toEqual([stopId]);
    expect(await returnFacts(roundId)).toBe(1);
  });
});
