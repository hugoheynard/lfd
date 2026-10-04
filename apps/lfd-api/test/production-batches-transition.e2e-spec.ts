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
 * - **le retirage pendant un colisage** n'efface plus le colisage : `save`
 *   recharge la journée sous le verrou.
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
  bootstrapProductionDay,
  closeLegacyPlan,
  pack,
  packing,
  place,
  references,
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
    await closeLegacyPlan(ctx);
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
    await closeLegacyPlan(ctx);
    await legacyCheck();

    expect(await worksheetLine(ctx)).toMatchObject({ produced: 30, done: true, initials: "LG" });
    expect(await storedBatches(ctx)).toHaveLength(0);
  });
});

describe("le retirage", () => {
  it("🔴 30 cochés puis 30 → 42 : la ligne n'est PAS complète", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 30 }]);
    await closeLegacyPlan(ctx);
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

  it("🔴 un colisage validé PENDANT un retirage n'est plus effacé", async () => {
    // Le trou d'avant les fournées : le retirage lisait la journée, le colisage
    // passait, puis `save` réécrivait les lignes depuis sa lecture — le bac
    // redevenait vide. On tient le verrou de la journée à la main, on lance le
    // retirage (il attend), on colise dans la même fenêtre, on relâche.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closeLegacyPlan(ctx);
    await legacyCheck();
    const [reference] = await references(ctx);
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 6 }]);

    let retaking: Promise<void> = Promise.resolve();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "production"."production_day"
        WHERE "service_day" = ${SERVICE_DAY} FOR UPDATE`;
      retaking = retake(ctx);
      await waitForLockWaiter();
      // Ce que la mise au bac écrit, dans la fenêtre où le retirage attend.
      await tx.productionOrderLine.updateMany({
        where: { order: { serviceDay: SERVICE_DAY, reference: reference ?? "" } },
        data: { packedAt: new Date(), packedBy: "staff-e2e", packedInitials: "MB" },
      });
    });
    await retaking;

    const view = await packing(ctx);
    expect(view.sheets).toHaveLength(2);
    const kept = view.sheets.find((sheet) => sheet.reference === reference);
    expect(kept?.lines[0]).toMatchObject({ packed: true, initials: "MB" });
  });

  it("le verrou n'empêche pas de coliser après un retirage", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closeLegacyPlan(ctx);
    await legacyCheck();
    const [reference] = await references(ctx);

    expect(await pack(ctx, reference ?? "")).toBe(204);
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
