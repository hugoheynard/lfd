/**
 * E2E de la **fournée automatique** (toujours vert) — plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.7, lot N3, sur le
 * vrai Postgres jetable : la route que le cron du Worker appelle toutes les
 * cinq minutes.
 *
 * Ce que seule cette suite prouve : le niveau figé par le tour, la fournée
 * déclarée sous son `id` déterministe et remise au colisage, le rejeu sur le
 * même état sans écriture, la porte du jeton machine, et la ligne sans palier
 * servie « à confirmer » dans la Supervision.
 *
 * L'horloge est fixée : la commande se passe et le plan s'arrête à l'heure
 * réelle pour la journée servie par défaut (dans une semaine), puis
 * l'horloge saute au matin de cette journée, à l'heure de la maison. Aucune
 * date du calendrier : tout part de `SERVICE_DAY`.
 */
import { localToInstant, type ProductionProblemsView } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { TrackingLevelsCommissioning } from "../src/production/atelier/domain/ports/tracking-levels-commissioning.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
} from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/production/tracking/always-green";
const AUTO_ID = `auto-${SERVICE_DAY}-${CROISSANT}-0`;
const COMMISSIONED_LONG_AGO = { since: (): Date => new Date(0) };

interface DayReport {
  readonly serviceDay: string;
  readonly arrested: boolean;
  readonly recorded: readonly string[];
  readonly toConfirm: readonly string[];
  readonly failed: readonly string[];
}

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: TrackingLevelsCommissioning, value: COMMISSIONED_LONG_AGO },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** L'instant de la maison `time` le jour servi. */
function morningAt(time: string): Date {
  const instant = localToInstant(SERVICE_DAY, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${SERVICE_DAY} ${time}`);
  }
  return instant;
}

/** 24 croissants retirés entre 07:00 et 08:00, plan arrêté ; `timed` : marge et tranches calculées. */
async function closedDay(timed: boolean): Promise<void> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 24 }]);
  if (timed) {
    await ctx
      .asSub(STAFF)
      .patch("/admin/delivery-availability")
      .send({ deliveryMarginMinutes: 50, pickupMarginMinutes: 20 })
      .expect(204);
    await ctx
      .asSub(STAFF)
      .put("/admin/production/settings/tranches")
      .send({ mode: "computed", fixedTranches: [] })
      .expect(204);
  }
  await closePlan(ctx);
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

async function tour(): Promise<DayReport> {
  const response = await ctx
    .http()
    .post(ROUTE)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  const report = jsonBody<{ readonly days: readonly DayReport[] }>(response);
  const today = report.days.find((day) => day.serviceDay === SERVICE_DAY);
  if (today === undefined) {
    throw new Error(`Le tour n'a pas lu le ${SERVICE_DAY}.`);
  }
  return today;
}

describe("la fournée automatique", () => {
  it("le palier échu (06:40 + 15 min) est déclaré, remis au colisage, sous son id ; rejoué, rien de plus", async () => {
    await closedDay(true);
    clock.set(morningAt("06:56"));

    expect(await tour()).toMatchObject({ arrested: true, recorded: [CROISSANT], failed: [] });
    expect(await tour()).toMatchObject({ recorded: [], failed: [] });

    const batches = await ctx.prisma.productionBatch.findMany();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: AUTO_ID,
      quantity: 24,
      recordedBy: "system:always-green",
    });
    expect(await ctx.prisma.productionHandoff.count({ where: { id: AUTO_ID } })).toBe(1);
    expect(await ctx.prisma.productionDayTrackingLevel.count()).toBe(1);
  });

  it("avant l'heure plus la marge, le niveau est figé mais rien n'est déclaré", async () => {
    await closedDay(true);
    clock.set(morningAt("06:54"));

    expect(await tour()).toMatchObject({ arrested: true, recorded: [] });
    expect(await ctx.prisma.productionBatch.count()).toBe(0);
    expect(await ctx.prisma.productionDayTrackingLevel.count()).toBe(1);
  });

  it("une ligne sans palier n'est pas complétée, et la Supervision la sert à confirmer", async () => {
    await closedDay(false);
    clock.set(morningAt("23:00"));

    expect(await tour()).toMatchObject({ recorded: [], toConfirm: [CROISSANT] });
    expect(await ctx.prisma.productionBatch.count()).toBe(0);
    const view = jsonBody<ProductionProblemsView>(
      await ctx
        .asSub(STAFF)
        .get(`/admin/supervision/production-problems?date=${SERVICE_DAY}`)
        .expect(200),
    );
    expect(view.unconfirmed).toEqual([
      { sku: CROISSANT, productName: "Croissant", quantity: 24, output: 0 },
    ]);
  });

  it("sans le jeton machine, la route refuse", async () => {
    await ctx.http().post(ROUTE).set("x-lfc-recompute-token", "faux").expect(401);
  });
});
