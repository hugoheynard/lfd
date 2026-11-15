/**
 * E2E du **retirage depuis les fournées** — plan
 * `documentation/fournil/la-fiche-d-atelier.md`.
 *
 * Ce qui ne se prouve que contre la base migrée : **le retirage** ne détruit
 * pas le colisage de l'ANCIEN poste — `save` recharge la journée sous le
 * verrou, et recopie telles quelles les colonnes `packed_*` qu'il ne lit plus
 * (K3c), un historique réel y est écrit —, et le verrou n'empêche pas de
 * coliser après un retirage.
 */
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
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

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

describe("le retirage", () => {
  it("🔴 le colisage de l'ancien poste, écrit PENDANT un retirage, n'est pas effacé", async () => {
    // Le trou d'avant les fournées : le retirage lisait la journée, le colisage
    // passait, puis `save` réécrivait les lignes depuis sa lecture — le bac
    // redevenait vide. Depuis K3c, le domaine ne lit plus ces colonnes ; `save`
    // les RECOPIE, et c'est ce qu'on éprouve : on tient le verrou de la journée
    // à la main, on lance le retirage (il attend), on écrit le colisage de
    // l'ancien poste dans la même fenêtre, on relâche.
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    const { reference } = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { reference: true },
    });
    await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 6 }]);

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
    await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 6 }]);
    await retake(ctx);
    // Une fournée REMISE au colisage : le bac ne se remplit que de ce qui est sorti.
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
