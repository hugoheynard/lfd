/**
 * E2E de la **garde** de `20261027110000_le_prix_pro_est_toujours_saisi`
 * (lot R3 de `documentation/pricing/plan-retirer-le-rapport-pro.md`), sur le
 * vrai Postgres.
 *
 * Une migration ne se rejoue pas « avant » dans un e2e : la base de test l'a
 * déjà appliquée. On exécute donc le bloc `DO` de garde LU DANS LE FICHIER,
 * entre ses deux marqueurs, dans une transaction annulée — la base sort de
 * chaque cas telle qu'elle y est entrée. Pour poser une ligne `ratio_ttc`, la
 * transaction rouvre d'abord la contrainte d'avant : c'est l'état d'une base
 * qui n'a pas encore reçu la migration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261027110000_le_prix_pro_est_toujours_saisi/migration.sql",
);

/** Le bloc de garde, tel que la migration l'exécute. */
function guardSql(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("-- garde:début");
  const end = sql.indexOf("-- garde:fin");
  if (start < 0 || end < start) {
    throw new RangeError("marqueurs de garde introuvables dans la migration");
  }
  return sql.slice(start, end);
}

/** Lève pour annuler la transaction une fois le cas jugé. */
class Rollback extends Error {}

type Method = "ratio_ttc" | "entered" | null;

/**
 * Rejoue la garde sur une base dont la ligne porte `method` (`null` = pas de
 * ligne), et rend le message de refus, ou `null` si elle passe.
 */
async function guardOutcome(ctx: E2eContext, method: Method): Promise<string | null> {
  let refusal: string | null = null;
  await ctx.prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `ALTER TABLE "pim"."accounting_rules" DROP CONSTRAINT "accounting_rules_method_known"`,
      );
      await tx.$executeRawUnsafe(
        `ALTER TABLE "pim"."accounting_rules" ADD CONSTRAINT "accounting_rules_method_known"
           CHECK ("pro_price_method" IN ('ratio_ttc', 'entered'))`,
      );
      if (method !== null) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "pim"."accounting_rules"
             ("id", "pro_price_ratio_bp", "pro_price_method", "updated_at")
           VALUES ('accounting', 9000, $1, CURRENT_TIMESTAMP)`,
          method,
        );
      }
      try {
        await tx.$executeRawUnsafe(guardSql());
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error);
      }
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    });
  return refusal;
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("la garde du prix toujours saisi", () => {
  it("refuse une base encore en ratio_ttc, en nommant le geste de sortie", async () => {
    const refusal = await guardOutcome(ctx, "ratio_ttc");

    expect(refusal).toContain("ratio_ttc");
    expect(refusal).toContain("Passer au prix saisi");
    expect(refusal).toContain("migrate resolve --rolled-back");
  });

  it("passe sur une base déjà en prix saisi", async () => {
    expect(await guardOutcome(ctx, "entered")).toBeNull();
  });

  it("passe sur une base sans règles comptables", async () => {
    expect(await guardOutcome(ctx, null)).toBeNull();
  });

  it("laisse la base telle qu'elle était, contrainte resserrée comprise", async () => {
    await guardOutcome(ctx, "ratio_ttc");

    expect(await ctx.prisma.accountingRules.count()).toBe(0);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "pim"."accounting_rules"
           ("id", "pro_price_ratio_bp", "pro_price_method", "updated_at")
         VALUES ('accounting', 9000, 'ratio_ttc', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow(/accounting_rules_method_known/);
  });
});
