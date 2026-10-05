/**
 * E2E de **la bascule vers les fournées** — plan
 * `documentation/production/plan-fournees-progressives.md`, §5 et D4.
 *
 * Ce qui ne se prouve que contre la base migrée :
 *
 * - **le rattrapage** de la migration `20260928160000_les_fournees`, rejoué deux
 *   fois — y compris après un `save` qui régénère les `id` du compte — ne double
 *   aucune fournée (objections B1, B2 de `vitruve`) ;
 * - **30 cochés puis 30 → 42** : le retirage matérialise la coche avant de
 *   changer la quantité, et la ligne n'est pas complète ;
 * - **le retirage** ne détruit pas le colisage de l'ANCIEN poste : `save`
 *   recharge la journée sous le verrou, et recopie telles quelles les colonnes
 *   `packed_*` qu'il ne lit plus (K3c) — un historique réel y est écrit.
 *
 * 🔴 Deux gestes sont écrits en SQL, et chacun le dit : la coche de l'ANCIEN
 * binaire (le nouveau n'écrit plus `done_*`, aucun handler ne sait donc la
 * produire), et le rattrapage lui-même, relu dans le fichier de migration pour
 * que ce soit SA requête qu'on éprouve, pas une copie.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createUser } from "./factories.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  bagLines,
  bootstrapProductionDay,
  closePlan,
  packing,
  place,
  recordBatch,
  retake,
  storedBatches,
  worksheetLine,
} from "./production-day-fixture.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** L'instruction de rattrapage, lue entre ses marqueurs dans la migration. */
function backfillSql(): string {
  const sql = readFileSync(
    join(process.cwd(), "prisma", "migrations", "20260928160000_les_fournees", "migration.sql"),
    "utf8",
  );
  const start = sql.indexOf("-- BACKFILL:BEGIN");
  const end = sql.indexOf("-- BACKFILL:END");
  if (start < 0 || end < start) {
    throw new Error("Les marqueurs BACKFILL de la migration des fournées ont disparu.");
  }
  return sql.slice(start, end);
}

async function runBackfill(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(backfillSql());
}

/**
 * Ce que l'ANCIEN binaire faisait en cochant : écrire `done_*` sur la ligne du
 * compte. Le nouveau ne le fait plus, d'où le SQL — c'est l'état qu'un poste
 * resté sur le binaire précédent laisse pendant la fenêtre de déploiement.
 */
async function legacyCheck(sku = CROISSANT): Promise<void> {
  await ctx.prisma.productionCount.updateMany({
    where: { serviceDay: SERVICE_DAY, sku },
    data: { doneAt: new Date(), doneBy: "staff-legacy", doneInitials: "LG" },
  });
}

describe("le rattrapage", () => {
  it("🔴 rejoué deux fois, y compris après un save, ne double aucune fournée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 30 }]);
    await closePlan(ctx);
    await legacyCheck();

    await runBackfill();
    await runBackfill();
    expect(await storedBatches(ctx)).toEqual([
      expect.objectContaining({ id: `backfill-${SERVICE_DAY}-${CROISSANT}`, quantity: 30 }),
    ]);

    // Un retirage réécrit le compte : nouveaux `id`, et plus de `done_*`. Un
    // poste resté sur l'ancien binaire recoche : la ligne a déjà une fournée,
    // le rattrapage ne la double pas.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await retake(ctx);
    await legacyCheck();
    await runBackfill();

    expect(await storedBatches(ctx)).toHaveLength(1);
    expect((await worksheetLine(ctx)).produced).toBe(30);
  });

  it("une coche héritée non rattrapée se lit quand même comme sortie", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 30 }]);
    await closePlan(ctx);
    await legacyCheck();

    expect(await worksheetLine(ctx)).toMatchObject({ produced: 30, done: true, initials: "LG" });
    expect(await storedBatches(ctx)).toHaveLength(0);
  });
});

describe("le retirage", () => {
  it("🔴 30 cochés puis 30 → 42 : la ligne n'est PAS complète", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 30 }]);
    await closePlan(ctx);
    await legacyCheck();
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);

    await retake(ctx);

    expect(await worksheetLine(ctx)).toMatchObject({
      quantity: 42,
      produced: 30,
      remaining: 12,
      done: false,
    });
    // La coche a été matérialisée sous l'id du rattrapage, avant d'absorber.
    expect(await storedBatches(ctx)).toEqual([
      expect.objectContaining({ id: `backfill-${SERVICE_DAY}-${CROISSANT}`, quantity: 30 }),
    ]);
  });

  it("🔴 le colisage de l'ancien poste, écrit PENDANT un retirage, n'est pas effacé", async () => {
    // Le trou d'avant les fournées : le retirage lisait la journée, le colisage
    // passait, puis `save` réécrivait les lignes depuis sa lecture — le bac
    // redevenait vide. Depuis K3c, le domaine ne lit plus ces colonnes ; `save`
    // les RECOPIE, et c'est ce qu'on éprouve : on tient le verrou de la journée
    // à la main, on lance le retirage (il attend), on écrit le colisage de
    // l'ancien poste dans la même fenêtre, on relâche.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await legacyCheck();
    const { reference } = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { reference: true },
    });
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 6 }]);

    let retaking: Promise<void> = Promise.resolve();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "production"."production_day"
        WHERE "service_day" = ${SERVICE_DAY} FOR UPDATE`;
      retaking = retake(ctx);
      await waitForLockWaiter();
      // Ce que l'ancien poste écrivait, dans la fenêtre où le retirage attend.
      await tx.productionOrder.updateMany({
        where: { serviceDay: SERVICE_DAY, reference },
        data: { packedAt: new Date(), packedBy: "staff-e2e", containerCount: 2 },
      });
      await tx.productionOrderLine.updateMany({
        where: { order: { serviceDay: SERVICE_DAY, reference } },
        data: { packedAt: new Date(), packedBy: "staff-e2e", packedInitials: "MB" },
      });
    });
    await retaking;

    expect(await ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(2);
    const kept = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { serviceDay: SERVICE_DAY, reference },
      select: {
        packedBy: true,
        containerCount: true,
        lines: { select: { packedBy: true, packedInitials: true } },
      },
    });
    expect(kept).toMatchObject({
      packedBy: "staff-e2e",
      containerCount: 2,
      lines: [{ packedBy: "staff-e2e", packedInitials: "MB" }],
    });
  });

  it("le verrou n'empêche pas de coliser après un retirage", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 6 }]);
    await retake(ctx);
    // Une fournée REMISE au colisage — une coche héritée ne l'est jamais.
    expect(await recordBatch(ctx, "01K6A0000000000000000000T1", 18)).toBe(204);
    for (let round = 0; round < 4; round += 1) {
      await ctx.drain();
    }
    const [sheet] = (await packing(ctx)).sheets;
    if (sheet === undefined) {
      throw new Error("La journée devait porter un bac.");
    }

    expect(await bagLines(ctx, sheet)).toBe(204);
  });
});

/** Attend qu'une AUTRE session soit bloquée sur un verrou — le retirage. */
async function waitForLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await ctx.prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND datname = current_database()`;
    if (row !== undefined && row.waiting > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Le retirage n'a jamais attendu le verrou de la journée.");
}
