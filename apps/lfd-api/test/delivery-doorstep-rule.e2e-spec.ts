/**
 * E2E **la décision réglée d'avance à la porte** (`documentation/livraisons/a-la-porte.md`,
 * B3 bis, LB-Q6 tranché par Hugo le 2026-10-01 : « global, overridable »,
 * « par adresse »).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 * - le réglage global « Rapporter » clôt l'arrêt AU SIGNALEMENT, tracé
 *   `setting`, sans prévenir personne, et le retrait apprend le retour ;
 * - une adresse « Déposer » redéfinit un global « Me demander » : le dépôt
 *   s'ouvre MÊME signature exigée ;
 * - « Me demander » laisse la décision au commercial, comme B3 ;
 * - la règle est FIGÉE au départ : la changer ensuite ne change rien ;
 * - les droits : le global ET l'adresse sous `delivery_procedures` (le
 *   commercial, depuis le 2026-10-02 pour le global), jamais sous
 *   `delivery_settings` seul, jamais au livreur.
 */
import type {
  AddressDoorstepRuleView,
  DoorstepRule,
  DoorstepSettingsView,
  MyDeliveryRoundView,
} from "@lfd/contracts";
import type request from "supertest";

import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import { departedStop, DOOR_ROLE, JPEG, myRound, orderStatus } from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const GLOBAL = "/admin/livraison/a-la-porte";

/** Les réglages de la livraison, sans les conditions : ce que le global n'exige plus. */
const SETTINGS_ONLY_ROLE = {
  key: "logistique",
  label: "Logistique",
  grants: [{ resource: "delivery_settings", action: "write" }],
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
});

async function setGlobal(rule: DoorstepRule): Promise<void> {
  await ctx.asSub(E2E_STAFF_SUB).put(GLOBAL).send({ rule }).expect(204);
}

/** La route du commercial sur l'adresse livrée de la commande. */
async function addressRuleRoute(orderId: string): Promise<string> {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { companyId: true, deliveryAddressId: true },
  });
  return `/admin/companies/${order.companyId ?? ""}/delivery-addresses/${order.deliveryAddressId ?? ""}/doorstep-rule`;
}

/** Un livreur parti (signature exigée, figée), une commerciale ; `beforeDeparture` règle ce qui sera figé. */
async function scene(
  beforeDeparture: (orderId: string) => Promise<void> = () => Promise.resolve(),
) {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const lea = await staffWithRole(ctx, "commerciale-lea", "commercial");
  const stop = await departedStop(ctx, paul, beforeDeparture);
  await ctx.prisma.deliveryStopExecution.update({
    where: { stopId: stop.stopId },
    data: { signatureRequired: true, depositAllowed: false },
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

function stopOf(view: MyDeliveryRoundView): MyDeliveryRoundView["stops"][number] | undefined {
  return view.stops[0];
}

async function noticesOfDecision(): Promise<number> {
  return ctx.prisma.staffNotification.count({ where: { kind: "delivery.stop_decision" } });
}

describe("la décision réglée d'avance à la porte (B3 bis)", () => {
  it("🔴 global « Rapporter » : le signalement clôt l'arrêt aussitôt, tracé par le réglage, sans notification", async () => {
    await setGlobal("bring_back");
    const { paul, roundId, orderId, stopId } = await scene();

    await reportNobody(paul.agent, roundId, stopId);
    await ctx.drain();

    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).not.toBeNull();
    expect(
      await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ outcome: "bring_back", source: "setting", decidedBy: null });
    expect(await orderStatus(ctx, orderId)).not.toBe("fulfilled");
    const departure = await ctx.prisma.orderDeparture.findUniqueOrThrow({ where: { orderId } });
    expect(departure.returnedAt).not.toBeNull();
    expect(await noticesOfDecision()).toBe(0);
    expect(stopOf(await myRound(paul.agent, roundId))).toMatchObject({
      decision: { state: "bring_back", source: "setting" },
    });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: roundId, type: "delivery_round.stop_brought_back" },
    });
    expect(fact.payload).toMatchObject({ source: "setting" });
  });

  it("🔴 une adresse « Déposer » redéfinit un global « Me demander » : dépôt ouvert, même signature exigée", async () => {
    await setGlobal("ask");
    const { paul, lea, roundId, orderId, stopId } = await scene(async (orderId) => {
      const route = await addressRuleRoute(orderId);
      await ctx.asSub("commerciale-lea").put(route).send({ rule: "deposit" }).expect(204);
    });
    const route = await addressRuleRoute(orderId);
    expect(jsonBody<AddressDoorstepRuleView>(await lea.agent.get(route).expect(200))).toEqual({
      rule: "deposit",
    });

    await reportNobody(paul.agent, roundId, stopId);

    const card = stopOf(await myRound(paul.agent, roundId));
    expect(card).toMatchObject({
      canDeposit: true,
      decision: { state: "authorize_deposit", source: "setting", decidedByName: null },
    });
    const version = (await myRound(paul.agent, roundId)).version;
    await paul.agent
      .post(`${MY_ROUND}/${roundId}/arrets/${stopId}/depot`)
      .field("version", String(version))
      .attach("photo", JPEG, "depot.jpg")
      .expect(204);
    await ctx.drain();
    expect(await orderStatus(ctx, orderId)).toBe("fulfilled");
    expect(await noticesOfDecision()).toBe(0);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "company.delivery_doorstep_rule_set" },
      }),
    ).toBe(1);
  });

  it("« Me demander » : la décision attend le commercial, qui est prévenu — comme B3", async () => {
    const { paul, roundId, stopId } = await scene();

    await reportNobody(paul.agent, roundId, stopId);
    await ctx.drain();

    expect(
      await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ outcome: null, source: null });
    expect(await noticesOfDecision()).toBe(1);
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).toBeNull();
  });

  it("🔴 la règle est figée au départ : la changer ensuite, au global comme à l'adresse, ne change rien", async () => {
    const { paul, lea, roundId, orderId, stopId } = await scene();
    await setGlobal("bring_back");
    await lea.agent
      .put(await addressRuleRoute(orderId))
      .send({ rule: "bring_back" })
      .expect(204);

    await reportNobody(paul.agent, roundId, stopId);

    expect(
      await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ doorstepRule: "ask" });
    expect(
      await ctx.prisma.deliveryStopDecision.findUniqueOrThrow({ where: { stopId } }),
    ).toMatchObject({ outcome: null });
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.closedAt).toBeNull();
  });

  it("le global se lit « par défaut » tant que personne ne l'a posé, puis tracé", async () => {
    const admin = ctx.asSub(E2E_STAFF_SUB);
    expect(jsonBody<DoorstepSettingsView>(await admin.get(GLOBAL).expect(200))).toEqual({
      rule: "ask",
      source: "default",
    });

    await setGlobal("deposit");

    expect(jsonBody<DoorstepSettingsView>(await admin.get(GLOBAL).expect(200))).toEqual({
      rule: "deposit",
      source: "explicit",
    });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "delivery_doorstep.settings_updated" },
      }),
    ).toBe(1);
  });

  it("🔴 le commercial (delivery_procedures:write) règle le global, et le relit", async () => {
    const { lea } = await scene();

    await lea.agent.put(GLOBAL).send({ rule: "bring_back" }).expect(204);

    expect(jsonBody<DoorstepSettingsView>(await lea.agent.get(GLOBAL).expect(200))).toEqual({
      rule: "bring_back",
      source: "explicit",
    });
  });

  /**
   * Régression : jusqu'au 2026-10-02 le global vivait sous `delivery_settings`,
   * que le commercial n'a pas — et qui ouvrirait véhicules, bacs et point de départ.
   */
  it("🔴 les droits : delivery_settings seul ne règle plus le global ; rien au livreur", async () => {
    const { paul, orderId } = await scene();
    const compta = await staffWithRole(ctx, "compta-ines", "comptabilite");
    await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(SETTINGS_ONLY_ROLE).expect(201);
    const logistics = await staffWithRole(ctx, "logistique-marc", SETTINGS_ONLY_ROLE.key);
    const route = await addressRuleRoute(orderId);

    await logistics.agent.get(GLOBAL).expect(403);
    await logistics.agent.put(GLOBAL).send({ rule: "bring_back" }).expect(403);
    await paul.agent.get(GLOBAL).expect(403);
    await paul.agent.put(GLOBAL).send({ rule: "bring_back" }).expect(403);
    await paul.agent.put(route).send({ rule: "deposit" }).expect(403);
    await compta.agent.put(route).send({ rule: "deposit" }).expect(403);
    await paul.agent.get(route).expect(403);
    expect(await ctx.prisma.address.findMany({ where: { doorstepRule: { not: null } } })).toEqual(
      [],
    );
    expect(await ctx.prisma.deliveryDoorstepSettings.count()).toBe(0);
  });

  it("une adresse qui n'est pas à cette société : 404", async () => {
    const { lea, orderId } = await scene();
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveryAddressId: true },
    });
    const elsewhere = `/admin/companies/ailleurs/delivery-addresses/${order.deliveryAddressId ?? ""}/doorstep-rule`;

    await lea.agent.put(elsewhere).send({ rule: "deposit" }).expect(404);
    await lea.agent.get(elsewhere).expect(404);
  });
});
