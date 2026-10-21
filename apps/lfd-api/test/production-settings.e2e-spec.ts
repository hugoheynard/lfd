/**
 * E2E des **réglages du fournil** — l'arrêt du plan (lu de l'heure limite
 * générale depuis le 2026-10-21) et les jours fermés (plan
 * `documentation/production/arret-du-plan.md`), et le droit de l'arrêt
 * (`production_count_stop`).
 *
 * Tout passe par les vraies routes, la vraie base et ses contraintes. Les
 * droits se posent comme à l'écran : un rôle créé par l'administrateur, qui ne
 * tient que ce qu'on éprouve.
 */
import type { ProductionSettingsView, RoleGrant } from "@lfd/contracts";
import { addDays, instantToLocal } from "@lfd/contracts";
import type request from "supertest";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const ROUTE = "/admin/production/settings";
const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const admin = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

/** Le jour de la maison, lu comme le serveur le lit. */
function today(): string {
  return instantToLocal(new Date()).day;
}

async function read(agent: request.Agent = admin()): Promise<ProductionSettingsView> {
  return jsonBody<ProductionSettingsView>(await agent.get(ROUTE).expect(200));
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
  await admin().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

/**
 * Depuis le 2026-10-21 (`limites-de-commande/plan-une-seule-heure.md` §5),
 * l'arrêt automatique n'est plus un réglage du fournil : il suit l'heure
 * limite générale, et la page le lit.
 */
/** L'heure du réassort, la veille (R3a) — l'autre borne de l'arrêt automatique. */
async function setResupplyCutoff(time: string): Promise<void> {
  await admin()
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: time })
    .expect(204);
}

describe("l'arrêt automatique, lu de l'heure limite générale", () => {
  it("sans heure limite posée : rien n'arrête le plan seul, aucun jour fermé", async () => {
    expect(await read()).toEqual({ automaticClose: null, closedDays: [] });
  });

  it("suit l'heure limite générale, rattrapage compris", async () => {
    // Depuis R3a, l'arrêt attend la plus tardive de la générale (rattrapage
    // compris) et de l'heure du réassort (20:00 par défaut) : le réassort est
    // posé plus tôt, pour que ce soit bien la générale qu'on éprouve.
    await setResupplyCutoff("18:00");
    await admin()
      .put("/admin/order-cutoffs/general")
      .send({ time: "18:00", daysBefore: 1, graceMinutes: 30 })
      .expect(204);

    expect((await read()).automaticClose).toEqual({ daysBefore: 1, time: "18:30" });
  });

  it("attend l'heure du réassort quand elle tombe plus tard que la générale (R3a)", async () => {
    await setResupplyCutoff("20:00");
    await admin()
      .put("/admin/order-cutoffs/general")
      .send({ time: "18:00", daysBefore: 1, graceMinutes: 30 })
      .expect(204);

    expect((await read()).automaticClose).toEqual({ daysBefore: 1, time: "20:00" });
  });

  it("ne se règle plus : la route du mode et des heures est retirée", async () => {
    await admin()
      .put(`${ROUTE}/close`)
      .send({ mode: "auto", closeAt: "21:00", alertAt: "20:00" })
      .expect(404);
  });
});

describe("l'arrêt à la main avant l'heure limite (Hugo, 2026-10-21, Q1)", () => {
  it("est refusé (409), en disant l'heure et où la changer", async () => {
    // Le plan de DAY s'arrête le jour même à 23:59 : toujours à venir.
    await admin()
      .put("/admin/order-cutoffs/general")
      .send({ time: "23:59", daysBefore: 0, graceMinutes: 0 })
      .expect(204);

    const response = await admin().post(`/admin/production/batch/${DAY}/close`).expect(409);

    expect(response.body).toMatchObject({ code: "production.day.before_order_cutoff" });
    expect(JSON.stringify(response.body)).toContain("Réglages › Commandes › Heure limite");
  });

  it("passe une fois l'heure limite tombée — ici, sur une journée vide", async () => {
    // Quatorze jours avant à 00:00 : tombée depuis longtemps pour demain. Le
    // réassort (la veille, donc aujourd'hui) est posé à 00:00 aussi : sans
    // lui, l'arrêt attendrait 20:00 ce soir (R3a) et le refus serait l'heure.
    await setResupplyCutoff("00:00");
    await admin()
      .put("/admin/order-cutoffs/general")
      .send({ time: "00:00", daysBefore: 14, graceMinutes: 0 })
      .expect(204);

    const response = await admin()
      .post(`/admin/production/batch/${serviceDay(1)}/close`)
      .expect(409);

    expect(response.body).toMatchObject({ code: "production.day.empty" });
  });
});

describe("les jours fermés", () => {
  it("se posent, se lisent à venir, se retirent — chaque geste journalisé une fois", async () => {
    const later = addDays(today(), 10);
    await admin().post(`${ROUTE}/closed-days`).send({ date: later }).expect(204);
    await admin().post(`${ROUTE}/closed-days`).send({ date: today() }).expect(204);
    await admin().post(`${ROUTE}/closed-days`).send({ date: later }).expect(204);

    expect((await read()).closedDays).toEqual([today(), later]);

    await admin().delete(`${ROUTE}/closed-days/${later}`).expect(204);
    await admin().delete(`${ROUTE}/closed-days/${later}`).expect(204);

    expect((await read()).closedDays).toEqual([today()]);
    const types = (
      await ctx.prisma.activityEvent.findMany({
        where: { type: { startsWith: "production_closed_day." } },
        orderBy: { occurredAt: "asc" },
        select: { type: true },
      })
    ).map((row) => row.type);
    expect(types.sort()).toEqual([
      "production_closed_day.added",
      "production_closed_day.added",
      "production_closed_day.removed",
    ]);
  });

  it("refuse (400) une date passée", async () => {
    await admin()
      .post(`${ROUTE}/closed-days`)
      .send({ date: addDays(today(), -1) })
      .expect(400);

    expect((await read()).closedDays).toEqual([]);
  });
});

describe("les droits", () => {
  it("sans `production_settings` : 403 en lecture comme en écriture", async () => {
    const baker = await holderOf("plan-sans-reglages", [
      { resource: "production_plan", action: "write" },
    ]);

    await baker.get(ROUTE).expect(403);
    await baker.post(`${ROUTE}/closed-days`).send({ date: today() }).expect(403);
  });

  it("`production_settings:read` lit, ne règle pas", async () => {
    const reader = await holderOf("reglages-lus", [
      { resource: "production_settings", action: "read" },
    ]);

    await reader.get(ROUTE).expect(200);
    await reader.post(`${ROUTE}/closed-days`).send({ date: today() }).expect(403);
  });

  it("🔴 arrêter le plan : 403 sous `production_plan:write`, la garde passe sous `production_count_stop:write`", async () => {
    const planner = await holderOf("plan-ecrit", [
      { resource: "production_plan", action: "write" },
    ]);
    const stopper = await holderOf("arret-du-plan", [
      { resource: "production_count_stop", action: "write" },
    ]);

    await planner.post(`/admin/production/batch/${DAY}/close`).expect(403);
    // La garde passe : c'est la journée, vide, que la clôture refuse — pas le droit.
    const response = await stopper.post(`/admin/production/batch/${DAY}/close`).expect(409);
    expect(JSON.stringify(response.body)).toContain("rien à arrêter");
  });
});
