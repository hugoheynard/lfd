/**
 * E2E du **tour de l'arrêt du plan** (plan
 * `documentation/production/plan-arret-du-plan.md`, §3, §4, B2, S4, S7, S8,
 * lot A2) — la route machine que le cron du Worker appelle toutes les cinq
 * minutes.
 *
 * L'horloge est fixée : les commandes se passent à l'heure réelle pour la
 * journée servie par défaut (dans une semaine), puis l'horloge saute à la
 * veille au soir — ou au matin même — de cette journée, à l'heure de la
 * maison. Aucune date du calendrier : tout part de `SERVICE_DAY`.
 */
import { addDays, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/production/auto-close";
const EVE = addDays(SERVICE_DAY, -1);

interface Report {
  readonly tomorrow: string;
  readonly outcome: string;
  readonly todayOverdue: boolean;
}

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([{ token: Clock, value: clock }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
});

/** L'instant de la maison `time` le jour `day`. */
function houseInstant(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

async function tour(): Promise<Report> {
  const response = await ctx
    .http()
    .post(ROUTE)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<Report>(response);
}

function admin(): request.Agent {
  return ctx.asSub(STAFF);
}

async function setAuto(): Promise<void> {
  await admin()
    .put("/admin/production/settings/close")
    .send({ mode: "auto", closeAt: "21:00", alertAt: "20:00" })
    .expect(204);
}

async function noticesOf(kind: string) {
  return ctx.prisma.staffNotification.findMany({ where: { kind } });
}

describe("mode automatique", () => {
  it("à l'heure, arrête le plan du lendemain UNE fois, signé par le système", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await setAuto();
    clock.set(houseInstant(EVE, "21:03"));

    expect(await tour()).toEqual({ tomorrow: SERVICE_DAY, outcome: "closed", todayOverdue: false });
    expect((await tour()).outcome).toBe("nothing");

    const day = await ctx.prisma.productionDay.findUnique({ where: { serviceDay: SERVICE_DAY } });
    expect(day?.closedAt).not.toBeNull();
    const attempts = await ctx.prisma.productionAutoCloseAttempt.findMany();
    expect(attempts).toMatchObject([{ serviceDay: SERVICE_DAY, outcome: "closed" }]);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_day.closed" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      actorType: "system",
      actorId: "auto-close",
      payload: { serviceDay: SERVICE_DAY, absorbed: 1, automatic: true },
    });
  });

  it("avant l'heure, ne fait rien", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await setAuto();
    clock.set(houseInstant(EVE, "20:58"));

    expect((await tour()).outcome).toBe("nothing");
    expect(await ctx.prisma.productionAutoCloseAttempt.count()).toBe(0);
  });

  it("lendemain vide : « rien à arrêter » une fois, et plus aucune tentative", async () => {
    await setAuto();
    clock.set(houseInstant(EVE, "21:00"));

    expect((await tour()).outcome).toBe("empty");
    clock.advanceMs(5 * 60 * 1000);
    expect((await tour()).outcome).toBe("nothing");

    const notices = await noticesOf("production.plan_nothing_to_arrest");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      audience: "production_count_stop:write",
      link: "/production/previsionnel",
      idempotencyKey: `notification:production.plan_nothing_to_arrest:${SERVICE_DAY}`,
    });
    expect(await ctx.prisma.productionAutoCloseAttempt.findMany()).toMatchObject([
      { outcome: "empty" },
    ]);
  });

  it("veille d'un jour fermé : ni arrêt, ni alerte", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await setAuto();
    await admin()
      .post("/admin/production/settings/closed-days")
      .send({ date: SERVICE_DAY })
      .expect(204);
    clock.set(houseInstant(EVE, "22:00"));

    expect((await tour()).outcome).toBe("nothing");
    expect(await ctx.prisma.productionAutoCloseAttempt.count()).toBe(0);
    expect(await ctx.prisma.staffNotification.count()).toBe(0);
  });
});

describe("mode manuel (le réglage de départ, alerte à 20:00)", () => {
  it("passé l'heure, une seule alerte — et le plan n'est pas arrêté", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    clock.set(houseInstant(EVE, "20:10"));

    expect((await tour()).outcome).toBe("alerted");
    expect((await tour()).outcome).toBe("alerted");

    expect(await noticesOf("production.plan_not_arrested")).toHaveLength(1);
    const day = await ctx.prisma.productionDay.findUnique({ where: { serviceDay: SERVICE_DAY } });
    expect(day?.closedAt ?? null).toBeNull();
  });
});

describe("le rattrapage (S4)", () => {
  it("le plan d'aujourd'hui ouvert avec des commandes : une alerte, jamais d'arrêt", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await setAuto();
    clock.set(houseInstant(SERVICE_DAY, "07:00"));

    expect((await tour()).todayOverdue).toBe(true);
    await tour();

    expect(await noticesOf("production.plan_today_not_arrested")).toHaveLength(1);
    const day = await ctx.prisma.productionDay.findUnique({ where: { serviceDay: SERVICE_DAY } });
    expect(day?.closedAt ?? null).toBeNull();
  });
});

describe("la porte machine", () => {
  it("refuse (401) sans le jeton, et avec un mauvais", async () => {
    await ctx.http().post(ROUTE).expect(401);
    await ctx.http().post(ROUTE).set("x-lfc-recompute-token", "faux").expect(401);
  });
});
