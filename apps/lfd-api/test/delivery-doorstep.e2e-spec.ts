/**
 * E2E **à la porte** (`documentation/livraisons/livreur/a-la-porte.md`, lot A) —
 * « Je suis arrivé », « Déclarer un problème », clore sans remise, le dépôt
 * autorisé figé et la règle de la signature, « Non remis ».
 *
 * Ce que seul le vrai SQL prouve : le mur du livreur dans le `where` de chaque
 * geste (404), l'arrivée écrite UNE fois, la clôture qui pose `closed_at` et
 * libère l'index des arrêts vivants, la photo rangée au bucket des pièces.
 */
import type {
  DeliveryIncidentsDayView,
  MyDeliveryRoundView,
  ReportedDeliveryIncidentResponse,
  UndeliveredStopsView,
} from "@lfd/contracts";
import type request from "supertest";
import type { Response } from "supertest";

import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { DRIVER_ROLE } from "./delivery-driver-scene.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import { declareBins, loadBin } from "./delivery-loading-scene.js";
import { forgetRoutingScene, seedLocatedDelivery } from "./delivery-routing-scene.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";

const DAY = serviceDay();
const POINT = { lat: 45.6, lng: 6.1 };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Le livreur tel qu'Hugo le réglera : conduire, ET les gestes à la porte. */
const DOOR_ROLE = DRIVER_ROLE;

/** Un rôle qui conduit sans les gestes de la porte (AP-D9 : deux droits). */
const DRIVE_ONLY_ROLE = {
  key: "conducteur",
  label: "Conducteur",
  grants: [{ resource: "delivery_driving", action: "write" }],
} as const;

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
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DRIVE_ONLY_ROLE).expect(201);
});

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

type Agent = ReturnType<E2eContext["asSub"]>;

/** Une tournée de `count` arrêts chargés, affectée à `driverId`, partie par lui. */
async function departedRound(
  driver: { readonly id: string; readonly agent: Agent },
  count: number,
  day: string = DAY,
): Promise<{ readonly roundId: string; readonly orderIds: readonly string[] }> {
  const roundId = await openRound(ctx, day, await addVehicle(ctx, "Kangoo"));
  const orderIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = await seedLocatedDelivery(ctx, day, POINT);
    await assign(ctx, day, roundId, orderId);
    const bins = await declareBins(ctx, orderId, 1);
    await loadBin(ctx, roundId, { binId: bins[0] ?? "" }).expect(204);
    orderIds.push(orderId);
  }
  const { version } = await roundOf(ctx, day, roundId);
  await admin(ctx)
    .put(`${ROUNDS}/${roundId}/livreur`)
    .send({ staffUserId: driver.id, version })
    .expect(204);
  const view = await myRound(driver.agent, roundId);
  await driver.agent
    .post(`${MY_ROUND}/${roundId}/depart`)
    .send({ version: view.version })
    .expect(204);
  return { roundId, orderIds };
}

async function myRound(agent: Agent, roundId: string): Promise<MyDeliveryRoundView> {
  return jsonBody<MyDeliveryRoundView>(await agent.get(`${MY_ROUND}/${roundId}`).expect(200));
}

async function stopIdOf(orderId: string): Promise<string> {
  return (
    await ctx.prisma.deliveryRoundStop.findFirstOrThrow({
      where: { orderId },
      select: { id: true },
    })
  ).id;
}

describe("« Je suis arrivé » (AP-D6)", () => {
  it("écrit l'instant une fois ; rejouée, 204 sans réécrire ; un fait au journal", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");

    await paul.agent.post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`).expect(204);
    const first = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({
      where: { stopId },
      select: { arrivedAt: true },
    });
    await paul.agent.post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`).expect(204);

    const again = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({
      where: { stopId },
      select: { arrivedAt: true },
    });
    expect(first.arrivedAt).not.toBeNull();
    expect(again.arrivedAt).toEqual(first.arrivedAt);
    expect((await myRound(paul.agent, roundId)).stops[0]?.arrivedAt).toBe(
      first.arrivedAt?.toISOString(),
    );
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_arrived" },
      }),
    ).toBe(1);
  });

  it("🔴 le mur : un autre livreur prend 404, et rien ne s'écrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");

    await lea.agent.post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`).expect(404);

    const execution = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({
      where: { stopId },
      select: { arrivedAt: true },
    });
    expect(execution.arrivedAt).toBeNull();
  });

  /**
   * Depuis l'audit 2026-10-07 (B8), un conducteur sans les gestes à la porte
   * n'est plus affectable : le cas ne naît plus que d'un droit perdu en route.
   * Paul part en livreur, puis l'administrateur le passe au rôle
   * « conducteur » par la vraie route de sa fiche — celle qui oublie le cache
   * d'accès.
   */
  it("conduire ne suffit pas : sans `delivery_doorstep`, 403 (AP-D9)", async () => {
    const paul = await staffWithRole(ctx, "conducteur-paul");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");
    await admin(ctx)
      .patch(`/admin/staff-users/${paul.id}`)
      .send({
        firstName: "conducteur-paul",
        lastName: "Test",
        email: "conducteur-paul@lfc.test",
        role: DRIVE_ONLY_ROLE.key,
      })
      .expect(204);

    await paul.agent.post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`).expect(403);
  });
});

describe("clore sans remise (AP-D2)", () => {
  it("🔴 409 nommé sur une commande encore à remettre — l'arrêt reste ouvert", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");
    const { version } = await myRound(paul.agent, roundId);

    const refused = await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version })
      .expect(409);

    expect(messageOf(refused)).toMatch(/TRN-0001 n'a été ni retirée au comptoir ni annulée/u);
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).toBeNull();
  });

  it("clôt l'arrêt d'une commande annulée en route, l'état se lit sur la carte ; rejouée : 204", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderIds } = await departedRound(paul, 2);
    const [cancelled = "", kept = ""] = orderIds;
    await ctx.prisma.order.update({ where: { id: cancelled }, data: { status: "cancelled" } });
    const stopId = await stopIdOf(cancelled);
    const before = await myRound(paul.agent, roundId);
    expect(before.stops.map((stop) => stop.orderState)).toEqual(["cancelled", "open"]);

    await lea.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version: before.version })
      .expect(404);
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version: before.version })
      .expect(204);
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version: before.version })
      .expect(204);

    const after = await myRound(paul.agent, roundId);
    expect(after.stops.map((stop) => [stop.rank, stop.closedAt !== null])).toEqual([
      [1, true],
      [2, false],
    ]);
    const stops = await ctx.prisma.deliveryRoundStop.findMany({
      where: { roundId },
      orderBy: { orderId: "asc" },
      select: { orderId: true, position: true, closedAt: true },
    });
    // Le vivant restant s'est resserré en 1 ; le clos garde sa position.
    expect(stops.find((stop) => stop.orderId === kept)?.position).toBe(1);
    expect(stops.find((stop) => stop.orderId === cancelled)?.closedAt).not.toBeNull();
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.stop_closed_without_handover" },
      }),
    ).toBe(1);
    // La commande n'est pas touchée : aucune remise, aucun retrait.
    expect(await ctx.prisma.orderHandover.count()).toBe(0);
  });
});

describe("le dépôt autorisé, figé au départ, et la signature qui l'emporte (AP-D5, AP-Q6)", () => {
  it("fige `deposit_allowed` ; signature exigée ⇒ `canDeposit` faux", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const orderIds: string[] = [];
    for (const signature of [false, true]) {
      const orderId = await seedLocatedDelivery(ctx, DAY, POINT);
      const order = await ctx.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { companyId: true, deliveryAddressId: true },
      });
      await admin(ctx)
        .put(
          `/admin/companies/${order.companyId ?? ""}/delivery-addresses/${order.deliveryAddressId ?? ""}/deposit`,
        )
        .send({ depositAllowed: true })
        .expect(204);
      await ctx.prisma.order.update({
        where: { id: orderId },
        data: {
          fulfillment: {
            window: { value: null, source: "default" },
            contact: {
              value: { prenom: "Anne", nom: "Colin", telephone: "0600000000" },
              source: "override",
            },
            signatureRequired: { value: signature, source: "override" },
          },
        },
      });
      await assign(ctx, DAY, roundId, orderId);
      const bins = await declareBins(ctx, orderId, 1);
      await loadBin(ctx, roundId, { binId: bins[0] ?? "" }).expect(204);
      orderIds.push(orderId);
    }
    const { version } = await roundOf(ctx, DAY, roundId);
    await admin(ctx)
      .put(`${ROUNDS}/${roundId}/livreur`)
      .send({ staffUserId: paul.id, version })
      .expect(204);
    const atDepot = await myRound(paul.agent, roundId);
    expect(atDepot.stops.map((stop) => [stop.depositAllowed, stop.canDeposit])).toEqual([
      [true, true],
      [true, false],
    ]);

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/depart`)
      .send({ version: atDepot.version })
      .expect(204);

    const frozen = await ctx.prisma.deliveryStopExecution.findMany({
      where: { roundId },
      orderBy: { departureRank: "asc" },
      select: { depositAllowed: true, signatureRequired: true },
    });
    expect(frozen).toEqual([
      { depositAllowed: true, signatureRequired: false },
      { depositAllowed: true, signatureRequired: true },
    ]);
    const departed = await myRound(paul.agent, roundId);
    expect(departed.stops.map((stop) => [stop.signatureRequired, stop.canDeposit])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it("une commande sans adresse du carnet part avec `false`, écrit", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await departedRound(paul, 1);

    const frozen = await ctx.prisma.deliveryStopExecution.findFirstOrThrow({
      where: { roundId },
      select: { depositAllowed: true },
    });
    expect(frozen.depositAllowed).toBe(false);
  });
});

describe("« Déclarer un problème » (§ 3)", () => {
  function report(
    agent: Agent,
    roundId: string,
    fields: Record<string, string>,
    photo?: Buffer,
  ): request.Test {
    let call = agent.post(`${MY_ROUND}/${roundId}/incidents`);
    for (const [name, value] of Object.entries(fields)) {
      call = call.field(name, value);
    }
    return photo === undefined ? call : call.attach("photo", photo, "porte.jpg");
  }

  it("signale, photo jointe ; l'admin et le livreur le relisent, la photo est servie", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");

    const created = jsonBody<ReportedDeliveryIncidentResponse>(
      await report(
        paul.agent,
        roundId,
        { family: "doorstep", reason: "nobody_present", note: "sonné trois fois", stopId },
        JPEG,
      ).expect(201),
    );
    await report(paul.agent, roundId, { family: "road", reason: "road_closed" }).expect(201);

    const ofDay = jsonBody<DeliveryIncidentsDayView>(
      await admin(ctx).get(`/admin/livraison/incidents?date=${DAY}`).expect(200),
    );
    expect(
      ofDay.incidents.map((incident) => [incident.family, incident.stopId, incident.hasPhoto]),
    ).toEqual([
      ["doorstep", stopId, true],
      ["road", null, false],
    ]);
    expect(ofDay.incidents[0]).toMatchObject({
      id: created.id,
      orderReference: "TRN-0001",
      note: "sonné trois fois",
      reportedBy: { staffUserId: paul.id, name: "livreur-paul Test" },
    });
    expect((await dayView(ctx, DAY)).incidents).toHaveLength(2);
    expect((await myRound(paul.agent, roundId)).incidents).toHaveLength(2);

    const served = await admin(ctx)
      .get(`/admin/livraison/incidents/${created.id}/photo`)
      .expect(200);
    expect(served.headers["content-type"]).toBe("image/jpeg");
    await paul.agent.get(`${MY_ROUND}/${roundId}/incidents/${created.id}/photo`).expect(200);
  });

  it("🔴 le mur : un autre livreur ne signale ni ne voit la photo (404)", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId } = await departedRound(paul, 1);
    const created = jsonBody<ReportedDeliveryIncidentResponse>(
      await report(
        paul.agent,
        roundId,
        { family: "technical", reason: "cold_failure" },
        JPEG,
      ).expect(201),
    );

    await report(lea.agent, roundId, { family: "technical", reason: "other" }).expect(404);
    await lea.agent.get(`${MY_ROUND}/${roundId}/incidents/${created.id}/photo`).expect(404);
    expect(await ctx.prisma.deliveryIncident.count()).toBe(1);
  });

  it("refuse un problème à la remise sans arrêt, et un motif d'une autre famille (400)", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await departedRound(paul, 1);

    const noStop = await report(paul.agent, roundId, {
      family: "doorstep",
      reason: "refused",
    }).expect(400);
    expect(messageOf(noStop)).toContain("porte sur un arrêt");
    await report(paul.agent, roundId, { family: "road", reason: "refused" }).expect(400);
    expect(await ctx.prisma.deliveryIncident.count()).toBe(0);
  });
});

describe("« Non remis » (AP-D7)", () => {
  it("liste les arrêts ouverts des tournées parties d'avant aujourd'hui, avec leurs signalements", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const past = serviceDay(-2);
    const old = await departedRound(paul, 1, past);
    await report(paul.agent, old.roundId, { family: "technical", reason: "vehicle_breakdown" });
    await departedRound(paul, 1, DAY);

    const view = jsonBody<UndeliveredStopsView>(
      await admin(ctx).get("/admin/livraison/non-remis").expect(200),
    );

    expect(view.stops.map((stop) => [stop.roundId, stop.serviceDay])).toEqual([
      [old.roundId, past],
    ]);
    expect(view.stops[0]?.incidents.map((incident) => incident.reason)).toEqual([
      "vehicle_breakdown",
    ]);
    expect(view.stops[0]?.arrivedAt).toBeNull();
  });

  async function report(agent: Agent, roundId: string, fields: Record<string, string>) {
    let call = agent.post(`${MY_ROUND}/${roundId}/incidents`);
    for (const [name, value] of Object.entries(fields)) {
      call = call.field(name, value);
    }
    await call.expect(201);
  }
});

describe("« Tournée terminée » (PL2)", () => {
  it("le livreur rentre : une fois, 204 rejouée ; les deux vues le portent, un fait au journal", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orderIds } = await departedRound(paul, 1);
    // B4 : le livreur ne termine qu'avec un sort pour chaque arrêt — ici, clos sans remise.
    await ctx.prisma.order.update({
      where: { id: orderIds[0] ?? "" },
      data: { status: "cancelled" },
    });
    const { version: closing } = await myRound(paul.agent, roundId);
    await paul.agent
      .post(
        `${MY_ROUND}/${roundId}/arrets/${await stopIdOf(orderIds[0] ?? "")}/cloture-sans-remise`,
      )
      .send({ version: closing })
      .expect(204);

    await lea.agent.post(`${MY_ROUND}/${roundId}/retour`).expect(404);
    await paul.agent.post(`${MY_ROUND}/${roundId}/retour`).expect(204);
    const first = await ctx.prisma.deliveryRound.findUniqueOrThrow({
      where: { id: roundId },
      select: { returnedAt: true, returnedBy: true, returnedByName: true },
    });
    await paul.agent.post(`${MY_ROUND}/${roundId}/retour`).expect(204);

    expect(first.returnedAt).not.toBeNull();
    expect([first.returnedBy, first.returnedByName]).toEqual([paul.id, "livreur-paul Test"]);
    const again = await ctx.prisma.deliveryRound.findUniqueOrThrow({
      where: { id: roundId },
      select: { returnedAt: true },
    });
    expect(again.returnedAt).toEqual(first.returnedAt);
    expect((await myRound(paul.agent, roundId)).returnedAt).toBe(first.returnedAt?.toISOString());
    expect((await roundOf(ctx, DAY, roundId)).returnedAt).toBe(first.returnedAt?.toISOString());
    expect(
      await ctx.prisma.activityEvent.count({
        where: { subjectId: roundId, type: "delivery_round.returned" },
      }),
    ).toBe(1);
  });

  it("refuse une tournée qui n'est pas partie (409), sans rien écrire", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const { version } = await roundOf(ctx, DAY, roundId);
    await admin(ctx)
      .put(`${ROUNDS}/${roundId}/livreur`)
      .send({ staffUserId: paul.id, version })
      .expect(204);

    const refused = await paul.agent.post(`${MY_ROUND}/${roundId}/retour`).expect(409);

    expect(messageOf(refused)).toContain("n'est pas partie");
    expect((await roundOf(ctx, DAY, roundId)).returnedAt).toBeNull();
  });

  it("rentrée, elle refuse l'arrivée, le signalement et la clôture sans remise — en le disant", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderIds } = await departedRound(paul, 1);
    const stopId = await stopIdOf(orderIds[0] ?? "");
    await ctx.prisma.order.update({
      where: { id: orderIds[0] ?? "" },
      data: { status: "cancelled" },
    });
    // L'arrêt reste ouvert pour éprouver les refus : seule la rentrée staff le permet (B4).
    await admin(ctx).post(`${ROUNDS}/${roundId}/retour`).expect(204);
    const { version } = await myRound(paul.agent, roundId);

    const arrival = await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/arrivee`)
      .expect(409);
    const incident = await paul.agent
      .post(`${MY_ROUND}/${roundId}/incidents`)
      .field("family", "road")
      .field("reason", "accident")
      .expect(409);
    const closing = await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/cloture-sans-remise`)
      .send({ version })
      .expect(409);

    for (const refused of [arrival, incident, closing]) {
      expect(messageOf(refused)).toContain("Cette tournée est terminée");
    }
    expect(await ctx.prisma.deliveryIncident.count()).toBe(0);
  });

  it("l'admin la déclare rentrée depuis Tournées ; « Non remis » montre alors son arrêt ouvert", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await departedRound(paul, 2);
    const before = jsonBody<UndeliveredStopsView>(
      await admin(ctx).get("/admin/livraison/non-remis").expect(200),
    );
    expect(before.stops).toEqual([]);

    await admin(ctx).post(`${ROUNDS}/${roundId}/retour`).expect(204);
    await admin(ctx).post(`${ROUNDS}/${roundId}/retour`).expect(204);

    const after = jsonBody<UndeliveredStopsView>(
      await admin(ctx).get("/admin/livraison/non-remis").expect(200),
    );
    expect(after.stops.map((stop) => [stop.roundId, stop.serviceDay])).toEqual([
      [roundId, DAY],
      [roundId, DAY],
    ]);
    expect(after.stops[0]?.returnedAt).not.toBeNull();
  });
});
