/**
 * La mécanique des courses sur le verrou d'une journée du fournil, partagée
 * par `packing-plan-hold-race` et `delivery-plan-hold-race` (2026-11-02) :
 * une transaction tient le verrou EXCLUSIF le temps de mettre les autres en
 * file, et Postgres accorde un verrou consultatif dans l'ordre d'attente — un
 * partagé ne double pas un exclusif qui attend avant lui.
 */
import type { E2eContext } from "./e2e-harness.js";

/** Assez pour mettre deux requêtes en file sur une machine lente. */
const HOLD_TIMEOUT_MS = 20_000;
const POLL_MS = 25;
/** Au-delà, la requête attendue n'est jamais venue en file : on le dit plutôt que de pendre. */
const WAIT_LIMIT_MS = 15_000;

/** Le nombre de demandes de verrou consultatif encore en attente. */
async function advisoryWaiters(ctx: E2eContext): Promise<number> {
  const rows = await ctx.prisma.$queryRaw<{ readonly waiting: bigint }[]>`
    SELECT count(*) AS waiting FROM pg_locks
    WHERE locktype = 'advisory' AND NOT granted
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
  return Number(rows[0]?.waiting ?? 0n);
}

/** Le nombre de sessions de la base de test bloquées sur un verrou, de quelque sorte qu'il soit. */
async function blockedSessions(ctx: E2eContext): Promise<number> {
  const rows = await ctx.prisma.$queryRaw<{ readonly blocked: bigint }[]>`
    SELECT count(*) AS blocked FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  return Number(rows[0]?.blocked ?? 0n);
}

/** Interroge `probe` jusqu'à `count`, borné : une file qui ne se forme pas échoue en le nommant. */
async function until(
  probe: () => Promise<number>,
  count: number,
  what: string,
  unless?: Promise<unknown>,
): Promise<void> {
  let settled = false;
  const settle = (): void => {
    settled = true;
  };
  void unless?.then(settle, settle);
  const started = performance.now();
  while (!settled && (await probe()) < count) {
    if (performance.now() - started > WAIT_LIMIT_MS) {
      throw new RangeError(`${count} ${what} attendues en ${WAIT_LIMIT_MS} ms, jamais venues.`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Attend que `count` demandes soient en file derrière le verrou consultatif. */
export function untilWaiters(
  ctx: E2eContext,
  count: number,
  unless?: Promise<unknown>,
): Promise<void> {
  return until(() => advisoryWaiters(ctx), count, "demandes de verrou consultatif", unless);
}

/**
 * Attend que `count` sessions soient bloquées sur un verrou, consultatif, de
 * table ou de ligne : une écriture qui attend la ligne qu'une autre tient ne
 * se voit pas dans les seuls verrous consultatifs. `unless` arrête l'attente
 * si la requête observée se termine au lieu d'entrer en file — c'est
 * justement ce que fait l'ancien code qu'une course doit faire échouer.
 */
export function untilBlocked(
  ctx: E2eContext,
  count: number,
  unless?: Promise<unknown>,
): Promise<void> {
  return until(() => blockedSessions(ctx), count, "sessions bloquées", unless);
}

/** Démarre une requête supertest tout de suite (elle est paresseuse) et rend sa réponse. */
export function started<T>(request: PromiseLike<T>): Promise<T> {
  return Promise.resolve(request);
}

/** Une porte qu'on ouvre de l'extérieur. */
export function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * Tient le verrou EXCLUSIF de la journée (clé de `PrismaProductionDayLock`)
 * jusqu'à `release` ; rend la transaction dans un objet — rendue nue, une
 * fonction `async` l'attendrait.
 */
export async function holdDayLock(
  ctx: E2eContext,
  serviceDay: string,
  release: Promise<void>,
): Promise<{ readonly done: Promise<void> }> {
  const key = `production_day:${serviceDay}`;
  const held = gate();
  const holder = ctx.prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      held.open();
      await release;
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
  await held.opened;
  return { done: holder };
}

/** Les tables qu'une course tient en mode `SHARE` : une liste fermée, le nom entre dans le SQL. */
const SHARE_LOCKED_TABLES = {
  resupply_receipt: `"public"."resupply_receipt"`,
  packing_container: `"packing"."container"`,
} as const;
export type ShareLockedTable = keyof typeof SHARE_LOCKED_TABLES;

/**
 * Tient la table en mode `SHARE` jusqu'à `release` : on la lit, on n'y écrit
 * pas. Sert à arrêter un geste au moment précis où il écrirait, sans toucher
 * à ce qu'il a déjà lu ni à ce que l'autre geste écrit ailleurs.
 */
export async function holdTableForReading(
  ctx: E2eContext,
  table: ShareLockedTable,
  release: Promise<void>,
): Promise<{ readonly done: Promise<void> }> {
  const held = gate();
  const holder = ctx.prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`LOCK TABLE ${SHARE_LOCKED_TABLES[table]} IN SHARE MODE`);
      held.open();
      await release;
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
  await held.opened;
  return { done: holder };
}

/**
 * Tient la réserve `(jour, SKU)` du colisage `FOR UPDATE` jusqu'à `release` —
 * le verrou que `PrismaPackingStockRepository.lock` prend avant de lire les
 * compteurs. La ligne est posée si elle manque, comme il le fait.
 */
export async function holdPackingStock(
  ctx: E2eContext,
  stock: { readonly serviceDay: string; readonly sku: string },
  release: Promise<void>,
): Promise<{ readonly done: Promise<void> }> {
  const held = gate();
  const holder = ctx.prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "packing"."packing_stock" ("service_day", "sku")
        VALUES (${stock.serviceDay}, ${stock.sku})
        ON CONFLICT ("service_day", "sku") DO NOTHING`;
      await tx.$queryRaw`
        SELECT 1 FROM "packing"."packing_stock"
         WHERE "service_day" = ${stock.serviceDay} AND "sku" = ${stock.sku}
           FOR UPDATE`;
      held.open();
      await release;
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
  await held.opened;
  return { done: holder };
}
