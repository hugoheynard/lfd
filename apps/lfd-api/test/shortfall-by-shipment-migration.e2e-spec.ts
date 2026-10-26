/**
 * La RECOPIE du manque vers `order_shortfall` (plan E7 reliquat, lot LB —
 * migration `20261026110000_le_manque_par_envoi`, étape 2), rejouée telle
 * qu'elle est écrite dans le fichier de migration.
 *
 * Ce que seul le vrai Postgres prouve : qu'une commande qui portait son
 * manque dans les colonnes d'`orders` le retrouve au rang 1, à l'identique,
 * et que la recopie rejouée n'écrit rien de plus ni n'écrase rien.
 *
 * L'état « avant » s'écrit en SQL brut : seul l'ancien code écrivait ces
 * colonnes, et il n'existe plus.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, CROISSANT } from "./production-day-fixture.js";
import { accountOrder } from "./shortfall-decision-scene.js";

const MIGRATION = resolve(
  process.cwd(),
  "prisma/migrations/20261026110000_le_manque_par_envoi/migration.sql",
);

/** L'étape 2 du fichier, mot pour mot : de son titre au titre de l'étape 3. */
function recopy(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf('INSERT INTO "public"."order_shortfall"');
  const end = sql.indexOf("-- 3.");
  if (start < 0 || end < start) {
    throw new RangeError("l'étape de recopie est introuvable dans la migration");
  }
  return sql.slice(start, end).trim();
}

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("la recopie du manque au rang 1 (LB)", () => {
  it("recopie les quatre colonnes au rang 1, et rejouée n'écrit rien de plus", async () => {
    const order = await accountOrder(ctx, 1);
    const reportedAt = new Date(Date.now() - 60_000);
    const decidedAt = new Date(Date.now() - 30_000);
    const lines = [{ sku: CROISSANT, due: 3, packed: 1 }];
    await ctx.prisma.$executeRaw`
      UPDATE "public"."orders"
         SET "shortfall_reported_at" = ${reportedAt},
             "shortfall_lines" = ${JSON.stringify(lines)}::jsonb,
             "shortfall_decided_at" = ${decidedAt}
       WHERE "id" = ${order.id}`;

    const first = await ctx.prisma.$executeRawUnsafe(recopy());
    const replayed = await ctx.prisma.$executeRawUnsafe(recopy());

    expect([first, replayed]).toEqual([1, 0]);
    const rows = await ctx.prisma.orderShortfall.findMany({ where: { orderId: order.id } });
    expect(rows).toEqual([
      { orderId: order.id, rank: 1, reportedAt, lines, clearedAt: null, decidedAt },
    ]);
  });

  it("n'écrase pas une ligne déjà là", async () => {
    const order = await accountOrder(ctx, 1);
    const clearedAt = new Date(Date.now() - 60_000);
    await ctx.prisma.orderShortfall.create({
      data: { orderId: order.id, rank: 1, clearedAt },
    });
    await ctx.prisma.$executeRaw`
      UPDATE "public"."orders"
         SET "shortfall_cleared_at" = ${new Date(Date.now() - 1_000)}
       WHERE "id" = ${order.id}`;

    expect(await ctx.prisma.$executeRawUnsafe(recopy())).toBe(0);
    expect(
      await ctx.prisma.orderShortfall.findMany({ select: { orderId: true, clearedAt: true } }),
    ).toEqual([{ orderId: order.id, clearedAt }]);
  });
});
