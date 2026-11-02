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
 * La mécanique : le geste lui-même tient le plan (`ArrestedPlanHold.hold`, le
 * verrou en mode partagé) dans une unité de travail qu'on garde ouverte ; la
 * réouverture, qui demande l'exclusif, se met en file (`pg_locks`, un
 * demandeur en attente) ; on relâche le geste, puis on lit ce que chacun a
 * vu. Postgres accorde un verrou consultatif dans l'ordre d'attente. L'autre
 * course — un sac ouvert pendant que la réouverture attend — est éprouvée
 * par `packing-plan-hold-race`.
 */
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { ArrestedPlanHold } from "../src/production/channels/packing/index.js";
import { createUser } from "./factories.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  MEMBER,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";

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

describe("rouvrir pendant que le colisage commence", () => {
  // Le test « un sac ouvert pendant que la réouverture attend » est retiré le
  // 2026-11-03 : depuis que le colisage tient le plan, ce sac attend derrière
  // la réouverture — son issue est éprouvée par `packing-plan-hold-race`.

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

    expect(await gesture).toBe("arrested");
    expect((await reopening).status).toBe(201);
    expect(await uow.run(() => hold.hold(SERVICE_DAY))).toBe("reopened");
  });
});
