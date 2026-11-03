/**
 * **Un fait de réouverture en retard contre un réarrêt en cours** — les vrais
 * abonnés du colisage et de la livraison, le vrai réarrêt, deux transactions
 * sur le vrai Postgres, ordonnées par le verrou de la journée.
 *
 * Régression (audit final du réassort, 2026-11-03) : les deux abonnés à
 * `production.day_reopened` demandaient « la journée est-elle de nouveau
 * arrêtée ? » SANS verrou (`ClosedPlansReader`). La boîte d'envoi livre au
 * moins une fois et sans ordre garanti : un fait rejoué pendant un réarrêt
 * lisait « non », puis retirait le colisage et défaisait les tournées du plan
 * qu'on venait d'arrêter. Désormais ils tiennent le plan (`ArrestedPlanHold`,
 * partagé) : le réarrêt, déjà en file, passe d'abord ; l'abonné le voit et ne
 * touche à rien.
 *
 * Sur l'ancien code, l'abonné ne se met jamais en file : la seconde attente
 * ne se résout pas, et le test échoue au délai.
 *
 * Mécanique : `day-lock-race.ts`.
 */
import type { DurableSubscriber } from "../src/platform/outbox/durable-handler.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { OnProductionDayReopened } from "../src/packing/application/handlers/on-production-day-reopened.handler.js";
import { ForgetReopenedPlan } from "../src/delivery/application/handlers/forget-reopened-plan.handler.js";
import { PRODUCTION_DAY_REOPENED } from "../src/production/channels/packing/index.js";
import { gate, holdDayLock, untilWaiters } from "./day-lock-race.js";
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

/** Une journée arrêtée puis rouverte, ses abonnés passés. */
async function reopenedDay(): Promise<void> {
  await place(ctx, issued, [{ sku: "VIE-001-1", quantity: 2 }]);
  await closePlan(ctx);
  await ctx.drain();
  await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
  await ctx.drain();
}

/** Un objet JSON relu en dictionnaire, sans transtypage. */
function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** Rejoue à l'abonné le dernier fait de réouverture, comme la boîte d'envoi le ferait. */
async function redeliver(subscriber: DurableSubscriber): Promise<void> {
  const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
    where: { type: PRODUCTION_DAY_REOPENED },
    orderBy: { occurredAt: "desc" },
  });
  await ctx.app
    .get(UnitOfWork)
    .run(() =>
      subscriber.handle({ eventId: fact.id, type: fact.type, payload: recordOf(fact.payload) }),
    );
}

/** Le réarrêt mis en file derrière le verrou tenu, puis le fait rejoué derrière lui. */
async function lateFactBehindRearrest(subscriber: DurableSubscriber): Promise<void> {
  const release = gate();
  const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

  const closing = ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/close`)
    .then((response) => response);
  await untilWaiters(ctx, 1);
  const late = redeliver(subscriber);
  await untilWaiters(ctx, 2);
  release.open();
  await holder.done;

  expect((await closing).status).toBe(201);
  await late;
  await ctx.drain();
}

describe("un fait de réouverture rejoué pendant un réarrêt", () => {
  it("🔴 le colisage attend le réarrêt et garde la liste du nouveau plan", async () => {
    await reopenedDay();

    await lateFactBehindRearrest(ctx.app.get(OnProductionDayReopened, { strict: false }));

    expect(await ctx.prisma.packingOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(1);
  });

  it("🔴 la livraison attend le réarrêt et garde le plan arrêté qu'elle vient d'apprendre", async () => {
    await reopenedDay();

    await lateFactBehindRearrest(ctx.app.get(ForgetReopenedPlan, { strict: false }));

    const day = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true },
    });
    expect(day.closedAt).not.toBeNull();
  });
});
