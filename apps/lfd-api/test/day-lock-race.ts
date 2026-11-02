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

/** Le nombre de demandes de verrou consultatif encore en attente. */
async function advisoryWaiters(ctx: E2eContext): Promise<number> {
  const rows = await ctx.prisma.$queryRaw<{ readonly waiting: bigint }[]>`
    SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
  return Number(rows[0]?.waiting ?? 0n);
}

/** Attend que `count` demandes soient en file derrière le verrou. */
export async function untilWaiters(ctx: E2eContext, count: number): Promise<void> {
  while ((await advisoryWaiters(ctx)) < count) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
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
