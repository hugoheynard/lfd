import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/**
 * La remise à zéro du harnais : elle ne vide que les tables remplies, et
 * remet à 1 les compteurs avancés (`truncateAll`, `e2e-harness.ts`). Ce sont
 * ses deux promesses, et chaque suite e2e en dépend : un état qui survit à
 * `reset()` fait échouer le test suivant pour une raison qui n'est pas la
 * sienne.
 */

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

/** Le nombre de lignes de chaque table des schémas déclarés, par nom qualifié. */
async function rowCounts(): Promise<Record<string, number>> {
  const tables = await ctx.prisma.$queryRaw<{ name: string }[]>`
    SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY 1
  `;
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await ctx.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM ${name}`,
    );
    counts[name] = Number(row?.n ?? 0);
  }
  return counts;
}

async function writeDayChange(): Promise<bigint> {
  const written = await ctx.prisma.orderDayChange.create({ data: { serviceDay: "2026-01-05" } });
  return written.id;
}

describe("la remise à zéro du harnais", () => {
  it("rend la base dans le même état, quoi qu'un test y ait écrit", async () => {
    await ctx.reset();
    const pristine = await rowCounts();

    await writeDayChange();
    await writeDayChange();
    await ctx.reset();

    expect(await rowCounts()).toEqual(pristine);
  });

  it("remet à 1 le compteur d'une table qu'elle a vidée", async () => {
    await ctx.reset();
    await writeDayChange();
    await writeDayChange();
    await ctx.reset();

    expect(await writeDayChange()).toBe(1n);
  });

  it("remet à 1 le compteur d'une table que le test a vidée lui-même", async () => {
    await ctx.reset();
    await writeDayChange();
    await ctx.prisma.orderDayChange.deleteMany({});
    await ctx.reset();

    expect(await writeDayChange()).toBe(1n);
  });
});
