/**
 * **Une passation contre l'arrêt du plan** — deux transactions sur le vrai
 * Postgres, ordonnées par le verrou de la journée.
 *
 * Régression (2026-11-02, même famille que G-A de l'audit du réassort) : la
 * clôture lisait les commandes du commerce AVANT de prendre le verrou de la
 * journée. Une commande admise entre cette lecture et le verrou — la passation
 * prend le même verrou par le guichet d'admission — n'était pas figée : la
 * journée s'arrêtait sans elle, et elle manquait au plan du fournil sans
 * qu'aucun refus ne l'ait dit. Désormais : figée, ou refusée « plan arrêté »
 * (reçue « hors plan » pour une saisie de l'équipe), jamais perdue.
 *
 * Le verrou est tenu par une troisième transaction, le temps de mettre la
 * passation PUIS l'arrêt en file : Postgres accorde un verrou consultatif dans
 * l'ordre d'attente, donc la passation valide la première, et l'arrêt doit
 * la voir.
 */
import type { ProductionPlanClosure } from "@lfd/contracts";

import { type E2eContext, jsonBody } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

/** La clé du verrou de la journée — celle de `PrismaProductionDayLock`. */
const DAY_LOCK_KEY = `production_day:${SERVICE_DAY}`;
/** Assez pour mettre deux requêtes en file sur une machine lente. */
const HOLD_TIMEOUT_MS = 20_000;
const POLL_MS = 25;

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
});

/** Le nombre de demandes de verrou consultatif encore en attente. */
async function advisoryWaiters(): Promise<number> {
  const rows = await ctx.prisma.$queryRaw<{ readonly waiting: bigint }[]>`
    SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
  return Number(rows[0]?.waiting ?? 0n);
}

async function untilWaiters(count: number): Promise<void> {
  while ((await advisoryWaiters()) < count) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

describe("arrêter le plan pendant qu'une commande passe", () => {
  it("la commande admise juste avant l'arrêt est figée dans le plan", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);

    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holder = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${DAY_LOCK_KEY}, 0))`;
        held();
        await released;
      },
      { timeout: HOLD_TIMEOUT_MS },
    );
    await lockHeld;

    const passation = placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 5 }]);
    await untilWaiters(1);
    const closing = ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`);
    const closingResponse = closing.then((response) => response);
    await untilWaiters(2);
    release();
    await holder;

    const placed = await passation;
    const closed = await closingResponse;
    expect(closed.status).toBe(201);
    const closure = jsonBody<ProductionPlanClosure>(closed);
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: placed.orderNumber },
      select: { id: true },
    });
    const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.day_closed" },
      select: { payload: true },
    });
    expect(closure).toMatchObject({ alreadyClosed: false, absorbed: 2 });
    expect(JSON.stringify(fact.payload)).toContain(order.id);
  });
});
