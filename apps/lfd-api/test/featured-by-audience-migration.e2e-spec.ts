/**
 * La migration `20261018190000_la_mise_en_avant_par_audience` recopie
 * `is_featured` vers les audiences que l'article sert (Hugo, 2026-10-18) : une
 * mise en avant posée avant le déploiement ne se perd pas.
 *
 * La base de test est déjà migrée : la migration est REJOUÉE ici sur des
 * lignes semées avec la seule colonne d'avant, puis relue.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261018190000_la_mise_en_avant_par_audience/migration.sql",
);

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

/** Un article semé par le harnais, rangé pour cette audience. */
async function anArticle(audience: string | null): Promise<string> {
  const item = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { override: null },
    orderBy: { sku: "asc" },
    select: { sku: true },
  });
  await ctx.prisma.catalogItem.update({ where: { sku: item.sku }, data: { audience } });
  return item.sku;
}

/** La décision telle qu'elle était avant : le seul booléen d'avant. */
async function featuredBefore(
  sku: string,
  hidden: { readonly pro?: boolean; readonly public?: boolean } = {},
): Promise<void> {
  await ctx.prisma.catalogItemOverride.create({
    data: {
      sku,
      isFeatured: true,
      isHidden: hidden.pro ?? false,
      isHiddenPublic: hidden.public ?? false,
    },
  });
}

async function replay(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(readFileSync(MIGRATION, "utf8"));
}

async function featured(sku: string) {
  return ctx.prisma.catalogItemOverride.findUniqueOrThrow({
    where: { sku },
    select: { isFeatured: true, isFeaturedPro: true, isFeaturedPublic: true },
  });
}

describe("la recopie de `is_featured` par audience", () => {
  it.each([
    [null, true, true],
    ["both", true, true],
    ["pro", true, false],
    ["public", false, true],
  ])("audience %s : pro %s, public %s", async (audience, pro, publique) => {
    const sku = await anArticle(audience);
    await featuredBefore(sku);

    await replay();

    // `is_featured` reste en base, intacte : colonne morte.
    expect(await featured(sku)).toEqual({
      isFeatured: true,
      isFeaturedPro: pro,
      isFeaturedPublic: publique,
    });
  });

  it("ne met pas en avant du côté où l'article est masqué", async () => {
    const sku = await anArticle("both");
    await featuredBefore(sku, { public: true });

    await replay();

    expect(await featured(sku)).toMatchObject({ isFeaturedPro: true, isFeaturedPublic: false });
  });

  it("ne lève rien sur une ligne qui n'était pas mise en avant", async () => {
    const sku = await anArticle("both");
    await ctx.prisma.catalogItemOverride.create({ data: { sku, isHidden: true } });

    await replay();

    expect(await featured(sku)).toMatchObject({ isFeaturedPro: false, isFeaturedPublic: false });
  });
});
