/**
 * **Rouvrir pendant que le colisage commence** — deux transactions sur le vrai
 * Postgres, ordonnées par le verrou de la journée.
 *
 * Régression (audit du réassort, 2026-11-02) : la réouverture demandait au
 * colisage et à la livraison s'ils avaient commencé AVANT de prendre le
 * verrou. Un sac ouvert entre la question et le verrou n'était pas vu : la
 * journée se rouvrait, et le plan était effacé sous un colisage commencé.
 * Désormais la question se pose sous le verrou, et un geste qui tient le plan
 * (`ArrestedPlanHold`) fait attendre la réouverture jusqu'à sa validation.
 *
 * Même mécanique que `production-day-close-race` : une troisième transaction
 * tient le verrou le temps de mettre la réouverture en file ; Postgres accorde
 * un verrou consultatif dans l'ordre d'attente.
 */
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { ArrestedPlanHold } from "../src/production/channels/packing/index.js";
import { createUser } from "./factories.js";
import { type E2eContext, jsonBody } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  MEMBER,
  packingOrderPath,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";

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
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
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

/** Une porte qu'on ouvre de l'extérieur. */
function gate(): { readonly opened: Promise<void>; readonly open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function closedAt(): Promise<Date | null> {
  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  return day.closedAt;
}

async function onlyOrderId(): Promise<string> {
  const row = await ctx.prisma.packingOrder.findFirstOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { orderId: true },
  });
  return row.orderId;
}

describe("rouvrir pendant que le colisage commence", () => {
  it("🔴 un sac ouvert pendant que la réouverture attend le verrou la fait refuser", async () => {
    await place(ctx, issued, [{ sku: "VIE-001-1", quantity: 2 }]);
    await closePlan(ctx);
    await ctx.drain();
    const orderId = await onlyOrderId();

    const release = gate();
    const held = gate();
    const holder = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${DAY_LOCK_KEY}, 0))`;
        held.open();
        await release.opened;
      },
      { timeout: HOLD_TIMEOUT_MS },
    );
    await held.opened;

    const reopening = ctx
      .asSub(STAFF)
      .post(`/admin/production/batch/${SERVICE_DAY}/reopen`)
      .then((response) => response);
    await untilWaiters(1);
    // Le colisage commence pendant que la réouverture attend : un sac ouvert.
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(orderId)}/containers`)
      .send({ nature: "bag" })
      .expect(201);
    release.open();
    await holder;

    const response = await reopening;
    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toContain("colisage");
    expect(await closedAt()).not.toBeNull();
  });

  it("un geste qui tient le plan fait attendre la réouverture ; arrivé après, il lit le plan rouvert", async () => {
    await place(ctx, issued, [{ sku: "VIE-001-1", quantity: 2 }]);
    await closePlan(ctx);
    await ctx.drain();
    const hold = ctx.app.get(ArrestedPlanHold);
    const uow = ctx.app.get(UnitOfWork);

    const release = gate();
    const held = gate();
    const gesture = uow.run(async () => {
      const arrested = await hold.hold(SERVICE_DAY);
      held.open();
      await release.opened;
      return arrested;
    });
    await held.opened;

    const reopening = ctx
      .asSub(STAFF)
      .post(`/admin/production/batch/${SERVICE_DAY}/reopen`)
      .then((response) => response);
    await untilWaiters(1);
    // La réouverture attend tant que le geste tient le plan.
    expect(await closedAt()).not.toBeNull();
    release.open();

    expect(await gesture).toBe(true);
    expect((await reopening).status).toBe(201);
    expect(await uow.run(() => hold.hold(SERVICE_DAY))).toBe(false);
  });
});
