/**
 * E2E de **« Lancer » un réassort « au plus tôt »** (R4a,
 * `documentation/reassort-boutiques/au-plus-tot.md`) sur le vrai
 * Postgres : le verrou de la journée, les colonnes et les CHECK de la
 * migration, le fait durable et son abonné du commerce.
 *
 * Ce qui ne s'éprouve qu'ici : la COURSE entre « Lancer » au fournil et
 * « Annuler » au comptoir — deux transactions sur le même verrou, dont une
 * seule gagne — et la journée jamais arrêtée que le lancement ouvre (Q5).
 *
 * L'horloge est figée le jour servi (J, dans une semaine), à 8 h : « au plus
 * tôt » vise J. Aucune date du calendrier. Une seule journée pour toute la
 * suite, dans l'ordre : la première l'ouvre (Q5), les suivantes lancent sur
 * une journée arrêtée — les comptes se lisent en écart.
 *
 * Écriture Prisma assumée : le point (`site.create`), faute de route de
 * création dans le harnais du fournil — la forme de `resupply-labo-flow`.
 */
import type { ResupplyProductionDayView } from "@lfd/contracts";
import { localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { gate, holdDayLock, started, untilWaiters } from "./day-lock-race.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
  worksheetLine,
} from "./production-day-fixture.js";
import { seedLabo } from "./site-resupply-scene.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    ADMIN_VERIFIER_OVERRIDE,
  ]));
  // Une journée vierge : les suites voisines laissent la leur arrêtée.
  await ctx.reset();
  const morning = localToInstant(SERVICE_DAY, "08:00");
  if (morning === null) {
    throw new TypeError(`heure locale inexistante : ${SERVICE_DAY} 08:00`);
  }
  clock.set(morning);
});

afterAll(async () => {
  await ctx.close();
});

const staff = () => ctx.asSub(STAFF);
const launchPath = (id: string) => `/admin/production/batch/${SERVICE_DAY}/resupplies/${id}/launch`;

/** Le comptoir pose ses croissants « au plus tôt » et envoie la demande. */
async function counterSendsAsap(site: string, quantity: number): Promise<string> {
  const base = `/admin/site-resupplies/sites/${site}`;
  const added = await staff()
    .post(`${base}/drafts/asap/lines`)
    .send({ sku: CROISSANT, quantity })
    .expect(201);
  const id = jsonBody<{ id: string }>(added).id;
  const view = jsonBody<{ drafts: readonly { id: string; version: number }[] }>(
    await staff().get(base).expect(200),
  );
  const version = view.drafts.find((draft) => draft.id === id)?.version;
  await staff().post(`${base}/${id}/send`).send({ version }).expect(204);
  return id;
}

/** Le compte à produire du croissant, lu sur la fiche d'atelier. */
async function counted(): Promise<number> {
  return (await worksheetLine(ctx)).quantity;
}

async function prodManagerTab(): Promise<ResupplyProductionDayView> {
  return jsonBody<ResupplyProductionDayView>(
    await staff().get(`/admin/site-resupplies/to-produce/${SERVICE_DAY}`).expect(200),
  );
}

describe("Lancer un réassort « au plus tôt » (R4a)", () => {
  it("ouvre la journée jamais arrêtée avec ce seul réassort, le compte, et l'affiche « lancé »", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 12);

    await staff().post(launchPath(id)).expect(204);
    await ctx.drain();

    const day = await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true, closedBy: true, packingOwner: true },
    });
    expect(day.closedBy).not.toBeNull();
    expect(day.packingOwner).toBe("packing");
    expect(day.closedAt).toEqual(clock.now());
    expect(
      await ctx.prisma.productionResupply.findMany({
        where: { serviceDay: SERVICE_DAY },
        select: { resupplyId: true, kind: true, launchedAt: true },
      }),
    ).toEqual([{ resupplyId: id, kind: "asap", launchedAt: clock.now() }]);
    expect(await counted()).toBe(12);
    const launched = (await prodManagerTab()).sites[0]?.resupplies[0];
    expect(launched).toMatchObject({ id, launchedAt: clock.now().toISOString() });
    expect(launched?.launchedBy).not.toBeUndefined();
  });

  it("refuse un second « Lancer » (409) et l'annulation au comptoir, avec le message du serveur", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 6);
    const before = await counted();
    await staff().post(launchPath(id)).expect(204);

    await staff().post(launchPath(id)).expect(409);
    const refusal = await staff()
      .post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`)
      .expect(409);

    expect(JSON.stringify(refusal.body)).toContain("déjà lancé ce réassort");
    expect(await counted()).toBe(before + 6);
  });

  it("un réassort annulé avant le lancement n'est plus lançable (404)", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 6);
    await staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(204);

    await staff().post(launchPath(id)).expect(404);

    expect(
      await ctx.prisma.productionResupply.count({
        where: { serviceDay: SERVICE_DAY, resupplyId: id },
      }),
    ).toBe(0);
  });

  /** Ce que le plan et le commerce disent du réassort, après la course. */
  async function outcomeOf(id: string): Promise<{ inPlan: number; cancelled: boolean }> {
    const inPlan = await ctx.prisma.productionResupply.count({
      where: { serviceDay: SERVICE_DAY, resupplyId: id },
    });
    const row = await ctx.prisma.siteResupply.findUniqueOrThrow({
      where: { id },
      select: { cancelledAt: true },
    });
    return { inPlan, cancelled: row.cancelledAt !== null };
  }

  /**
   * La course « Lancer » / « Annuler », l'ordre imposé : la journée est tenue,
   * le premier geste se met en file, le second derrière lui. L'annulation
   * doit attendre le verrou que le lancement prend (`LaunchedResupplies`) —
   * sans lui, elle passerait devant et le réassort finirait annulé ET lancé.
   */
  it("🔴 « Lancer » en file avant « Annuler » : le lancement gagne, l'annulation est refusée", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 9);
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const launched = started(staff().post(launchPath(id)));
    await untilWaiters(ctx, 1, launched);
    const cancelled = started(staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`));
    // Un premier geste qui n'a pas attendu le verrou ne fera jamais file : on cesse d'attendre.
    await untilWaiters(ctx, 2, Promise.race([launched, cancelled]));
    release.open();
    await holder.done;

    const answers = await Promise.all([launched, cancelled]);
    expect(answers.map((answer) => answer.status)).toEqual([204, 409]);
    expect(await outcomeOf(id)).toEqual({ inPlan: 1, cancelled: false });
  });

  it("🔴 « Annuler » en file avant « Lancer » : l'annulation gagne, le lancement ne trouve plus rien", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 9);
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const cancelled = started(staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`));
    await untilWaiters(ctx, 1, cancelled);
    const launched = started(staff().post(launchPath(id)));
    await untilWaiters(ctx, 2, Promise.race([cancelled, launched]));
    release.open();
    await holder.done;

    const answers = await Promise.all([cancelled, launched]);
    expect(answers.map((answer) => answer.status)).toEqual([204, 404]);
    expect(await outcomeOf(id)).toEqual({ inPlan: 0, cancelled: true });
  });

  it("un réassort lancé survit à la réouverture et revient au ré-arrêt", async () => {
    const labo = await seedLabo(ctx);
    const id = await counterSendsAsap(labo, 5);
    await staff().post(launchPath(id)).expect(204);
    const launched = await ctx.prisma.productionResupply.count({
      where: { serviceDay: SERVICE_DAY, kind: "asap" },
    });
    const before = await counted();

    await staff().post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    expect(
      await ctx.prisma.productionResupply.count({
        where: { serviceDay: SERVICE_DAY, kind: "asap" },
      }),
    ).toBe(launched);
    await staff().post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(409);

    await staff().post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
    expect(await counted()).toBe(before);
  });
});
