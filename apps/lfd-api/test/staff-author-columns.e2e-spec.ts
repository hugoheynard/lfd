/**
 * E2E du **resserrement des colonnes d'auteur** — la migration
 * `20260918220000_resserrement_des_colonnes_d_auteur`, rejouée sur l'état que
 * 5B laisse en production. Plan : `documentation/journalisation/architecture-journalisation.md` §12
 * — D8, D9, étape 5C.
 *
 * Ce que seul le vrai SQL prouve :
 *
 * - la dernière recopie remplit une jumelle vide, n'écrase pas une jumelle
 *   remplie, laisse un nul nul là où il est permis ;
 * - le NOT NULL est posé sur les cinq nouvelles colonnes dont l'ancienne le
 *   portait, et seulement elles ;
 * - les sept anciennes colonnes et l'index de `staff_sub` ont disparu.
 *
 * La migration supprime des colonnes : elle ne se rejoue pas, et la scène se
 * joue dans une transaction annulée (`staff-author-columns-scene`). La base
 * migrée par `db:test:setup` est vérifiée à part : c'est elle que le code voit.
 *
 * Les suites 5A (recopie) et 5B (bascule) ont été retirées avec cette étape :
 * elles rejouaient leur SQL sur les anciennes colonnes, qui n'existent plus.
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  AUTHOR_PAIRS,
  COPIED,
  migrationStatements,
  type NewAuthor,
  newAuthors,
  type RawSql,
  reconstituteStateAfter5B,
  seedOldForm,
  TIGHTENED_TABLES,
} from "./staff-author-columns-scene.js";

/** 7 recopies, 5 NOT NULL, 1 index, 7 colonnes. */
const TIGHTEN = migrationStatements("20260918220000_resserrement_des_colonnes_d_auteur", 20);

const OLD_INDEX = "staff_push_subscriptions_staff_sub_idx";
const NEW_INDEX = "staff_push_subscriptions_staff_user_id_idx";

/** Lancée pour annuler la transaction d'essai : tout ce qu'elle a fait repart. */
class RollbackProbe extends Error {}

interface AuthorSchema {
  /** `table.colonne` → nullable ? Absente = pas de clé. */
  readonly columns: Readonly<Record<string, boolean>>;
  readonly indexes: readonly string[];
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

/** Les colonnes d'auteur des sept paires, anciennes et nouvelles, lues du catalogue. */
async function authorSchema(tx: RawSql): Promise<AuthorSchema> {
  const names = AUTHOR_PAIRS.flatMap((pair) => [
    `${pair.table}.${pair.old}`,
    `${pair.table}.${pair.new}`,
  ]);
  const columns = await tx.$queryRaw<readonly { name: string; nullable: string }[]>`
    SELECT table_name || '.' || column_name AS name, is_nullable AS nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name || '.' || column_name = ANY(${names})
    ORDER BY name`;
  const indexes = await tx.$queryRaw<readonly { name: string }[]>`
    SELECT indexname AS name FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'staff_push_subscriptions'
      AND indexname IN (${OLD_INDEX}, ${NEW_INDEX})
    ORDER BY name`;
  return {
    columns: Object.fromEntries(columns.map((row) => [row.name, row.nullable === "YES"])),
    indexes: indexes.map((row) => row.name),
  };
}

/** Ce que 5C doit laisser : les nouvelles seules, NOT NULL là où c'est dû. */
const EXPECTED_AFTER_5C: AuthorSchema = {
  columns: Object.fromEntries(
    AUTHOR_PAIRS.map((pair) => [`${pair.table}.${pair.new}`, !TIGHTENED_TABLES.has(pair.table)]),
  ),
  indexes: [NEW_INDEX],
};

describe("le resserrement des colonnes d'auteur (5C)", () => {
  it("recopie, resserre et supprime, sur l'état que 5B laisse", async () => {
    const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
    let observed: { authors: readonly NewAuthor[]; schema: AuthorSchema } | null = null;

    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await reconstituteStateAfter5B(tx);
        await seedOldForm(tx, company.id);
        for (const statement of TIGHTEN) {
          await tx.$executeRawUnsafe(statement);
        }
        observed = {
          authors: await newAuthors(tx, company.id),
          schema: await authorSchema(tx),
        };
        throw new RollbackProbe();
      }),
    ).rejects.toBeInstanceOf(RollbackProbe);

    expect(observed).toEqual({ authors: COPIED, schema: EXPECTED_AFTER_5C });
  });

  it("la reconstitution rend bien les anciennes colonnes — sans quoi le cas ci-dessus ne prouverait rien", async () => {
    let before: AuthorSchema | null = null;

    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await reconstituteStateAfter5B(tx);
        before = await authorSchema(tx);
        throw new RollbackProbe();
      }),
    ).rejects.toBeInstanceOf(RollbackProbe);

    expect(before).toEqual({
      columns: Object.fromEntries(
        AUTHOR_PAIRS.flatMap((pair) => [
          [`${pair.table}.${pair.old}`, true],
          [`${pair.table}.${pair.new}`, true],
        ]),
      ),
      indexes: [OLD_INDEX, NEW_INDEX],
    });
  });

  it("la base migrée n'a plus que les nouvelles colonnes, NOT NULL là où c'est dû", async () => {
    expect(await authorSchema(ctx.prisma)).toEqual(EXPECTED_AFTER_5C);
  });
});
