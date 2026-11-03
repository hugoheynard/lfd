/**
 * E2E des **courses du réassort au plan figé** (R3a) : « Annuler » au comptoir
 * contre l'arrêt du plan au fournil, l'ordre imposé par un verrou tenu
 * (`test/day-lock-race.ts`). Sorti de `resupply-frozen-plan` le 2026-11-03,
 * qui dépassait 300 lignes ; la scène commune vit dans
 * `resupply-frozen-plan-scene.ts`.
 *
 * L'horloge est gelée la VEILLE de la journée servie : les heures se
 * comparent à elle seule, jamais au calendrier.
 */
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { gate, holdDayLock, started, untilWaiters } from "./day-lock-race.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { cancel, eveAt, frozen, sendTomorrow, twoHours } from "./resupply-frozen-plan-scene.js";

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
  await ctx.reset();
  clock.set(eveAt("12:00"));
});

describe("annuler pendant l'arrêt du plan", () => {
  /** Ce que le commerce et le plan disent du réassort, après la course. */
  async function outcomeOf(id: string): Promise<{ cancelled: boolean; inPlan: boolean }> {
    const row = await ctx.prisma.siteResupply.findUniqueOrThrow({
      where: { id },
      select: { cancelledAt: true },
    });
    const inPlan = (await frozen(ctx)).some((frozenRow) => frozenRow.resupplyId === id);
    return { cancelled: row.cancelledAt !== null, inPlan };
  }

  /**
   * La course, l'ordre imposé : la journée est tenue, le premier geste se met
   * en file, le second derrière lui. L'annulation doit attendre le verrou que
   * l'arrêt prend (`PlanAdmissionDesk.admit`) — sans lui, elle lirait « plan
   * ouvert » pendant que l'arrêt fige la liste, et le réassort finirait annulé
   * au comptoir ET produit au fournil.
   */
  it("🔴 l'arrêt en file avant l'annulation : le réassort est figé, l'annulation refusée", async () => {
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const { site, id } = await sendTomorrow(ctx, 4);
    clock.set(eveAt("20:00"));
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const stopped = started(ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`));
    await untilWaiters(ctx, 1, stopped);
    const cancelled = started(cancel(ctx, site, id));
    await untilWaiters(ctx, 2, Promise.race([stopped, cancelled]));
    release.open();
    await holder.done;
    const answers = await Promise.all([stopped, cancelled]);
    await ctx.drain();

    expect(answers.map((answer) => answer.status)).toEqual([201, 409]);
    expect(await outcomeOf(id)).toEqual({ cancelled: false, inPlan: true });
  });

  it("🔴 l'annulation en file avant l'arrêt : le réassort est annulé, le plan ne le porte pas", async () => {
    // Une commande, pour que la journée reste arrêtable une fois le réassort annulé.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const { site, id } = await sendTomorrow(ctx, 4);
    clock.set(eveAt("20:00"));
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const cancelled = started(cancel(ctx, site, id));
    await untilWaiters(ctx, 1, cancelled);
    const stopped = started(ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`));
    await untilWaiters(ctx, 2, Promise.race([cancelled, stopped]));
    release.open();
    await holder.done;
    const answers = await Promise.all([cancelled, stopped]);
    await ctx.drain();

    expect(answers.map((answer) => answer.status)).toEqual([204, 201]);
    expect(await outcomeOf(id)).toEqual({ cancelled: true, inPlan: false });
  });
});
