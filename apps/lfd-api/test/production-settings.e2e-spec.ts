/**
 * E2E des **réglages du fournil** — l'arrêt du plan et les jours fermés (plan
 * `documentation/production/plan-arret-du-plan.md`, §2, §6, Q5, Q6, lot A1),
 * et le droit neuf de l'arrêt (`production_count_stop`).
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

describe("le réglage d'arrêt du plan", () => {
  it("part en manuel, alerte à 20:00, sans heure limite ni jour fermé", async () => {
    expect(await read()).toEqual({
      close: { mode: "manual", closeAt: null, alertAt: "20:00" },
      latestOrderCutoff: null,
      closedDays: [],
    });
  });

  it("passe en automatique après l'heure limite, et le journalise", async () => {
    await admin()
      .post("/admin/order-cutoffs")
      .send({ time: "18:00", daysBefore: 1, graceMinutes: 30 })
      .expect(201);

    await admin()
      .put(`${ROUTE}/close`)
      .send({ mode: "auto", closeAt: "21:00", alertAt: "20:00" })
      .expect(204);

    expect(await read()).toMatchObject({
      close: { mode: "auto", closeAt: "21:00", alertAt: "20:00" },
      latestOrderCutoff: { daysBefore: 1, time: "18:30" },
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_settings.close_changed" },
    });
    expect(facts).toHaveLength(1);
  });

  it("refuse (409) une heure d'arrêt antérieure à l'heure limite, rattrapage compris", async () => {
    await admin()
      .post("/admin/order-cutoffs")
      .send({ time: "18:00", daysBefore: 1, graceMinutes: 30 })
      .expect(201);

    const response = await admin()
      .put(`${ROUTE}/close`)
      .send({ mode: "auto", closeAt: "18:15", alertAt: null })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("la veille à 18:30");
    expect((await read()).close.mode).toBe("manual");
  });

  it.each([
    ["hors bornes", { mode: "auto", closeAt: "11:00", alertAt: null }],
    ["automatique sans heure", { mode: "auto", closeAt: null, alertAt: "20:00" }],
    ["manuel sans alerte", { mode: "manual", closeAt: null, alertAt: null }],
    ["heure mal formée", { mode: "manual", closeAt: null, alertAt: "20h" }],
  ])("refuse (400) : %s", async (_case, body) => {
    await admin().put(`${ROUTE}/close`).send(body).expect(400);

    expect((await read()).close).toEqual({ mode: "manual", closeAt: null, alertAt: "20:00" });
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
    await baker
      .put(`${ROUTE}/close`)
      .send({ mode: "manual", closeAt: null, alertAt: "19:00" })
      .expect(403);
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
