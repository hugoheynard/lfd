/**
 * E2E de la **migration de bascule** — `20261029100000_le_defaut_se_vend_sous_sa_reference`,
 * rejouée (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 1, § 2, L3).
 *
 * Ce que seul ce niveau prouve : le garde-fou compte dans les VRAIES tables,
 * sous le vrai schéma, et un refus n'écrit RIEN — la transaction explicite du
 * fichier s'annule entière. Puis, sans refus : l'alias de chaque défaut, la
 * réécriture des magasins de configuration, et le rejeu sans effet.
 *
 * Le fichier est lu tel quel et joué par un client `pg` à part, en mode
 * `strict` (`SET LOCAL lfd.default_sku_switch_guard`) : la base de test est
 * l'une de celles où le garde-fou s'éteint, pour que `db:test:setup` passe sur
 * des restes de suites. Les lignes sont semées par Prisma : ce qui est éprouvé
 * est la migration, pas les gestes qui les poseraient.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { testDatabaseUrl } from "./setup-env.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261029100000_le_defaut_se_vend_sous_sa_reference/migration.sql",
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
  // Avant la bascule : la table d'alias est vide (le semis joue l'après).
  await ctx.prisma.saleSkuAlias.deleteMany({});
  await ctx.prisma.productionContainer.create({
    data: { sku: "PAI-001", unitsPerContainer: 25, singular: "manne", plural: "mannes" },
  });
});

/** Joue le fichier, garde-fou forcé ; rend l'erreur levée, ou `null`. */
async function runMigration(): Promise<Error | null> {
  const sql = readFileSync(MIGRATION, "utf8").replace(
    /^BEGIN;$/mu,
    "BEGIN;\nSET LOCAL lfd.default_sku_switch_guard = 'strict';",
  );
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    await client.query("ROLLBACK");
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    await client.end();
  }
}

/** Ce que la migration écrirait : rien de tout ça ne doit bouger sur un refus. */
async function written(): Promise<{ aliases: number; container: string | null }> {
  const aliases = await ctx.prisma.saleSkuAlias.count();
  const container = await ctx.prisma.productionContainer.findFirst({ select: { sku: true } });
  return { aliases, container: container?.sku ?? null };
}

const UNTOUCHED = { aliases: 0, container: "PAI-001" };

describe("le garde-fou de la bascule — il compte, nomme, et n'écrit rien", () => {
  it("refuse une règle tarifaire posée sur une référence produit", async () => {
    await ctx.prisma.priceRule.create({
      data: {
        id: "rule_paillasse",
        stage: "promotion",
        nature: "alter",
        scopeType: "product",
        scopeId: "PAI-001",
        audienceType: "all",
        direction: "decrease",
        mode: "percent",
        value: 1_000,
        validFrom: new Date(daysAgo(3)),
        label: "Promo baguette",
        createdBy: "e2e",
      },
    });

    const refusal = await runMigration();

    expect(refusal?.message).toContain("bascule-defaut refusée, rien n'a été écrit");
    expect(refusal?.message).toContain("1 × PriceRule (product:PAI-001 (rule_paillasse))");
    expect(await written()).toEqual(UNTOUCHED);
  });

  it("refuse une ligne de mercuriale sur une référence produit, archivée comprise", async () => {
    await ctx.prisma.companyMercuriale.create({
      data: {
        id: "mc_paillasse",
        companyId: "co_e2e",
        label: "Négocié",
        lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }] }],
        validFrom: new Date(daysAgo(30)),
        createdBy: "e2e",
        archivedAt: new Date(daysAgo(1)),
      },
    });

    const refusal = await runMigration();

    expect(refusal?.message).toContain("1 × CompanyMercuriale (mc_paillasse ligne PAI-001)");
    expect(await written()).toEqual(UNTOUCHED);
  });

  it("refuse un changement de déclinaison par défaut déjà joué, en nommant le produit et le jour", async () => {
    const occurredAt = new Date(daysAgo(2));
    await ctx.prisma.activityEvent.create({
      data: {
        id: "evt_g4",
        type: "product.default_variant_changed",
        occurredAt,
        subjectType: "product",
        subjectId: "prod_PAI-001",
        actorType: "staff",
        traceId: "trace_g4",
        idempotencyKey: "g4-e2e",
        payload: { sku: "PAI-001-2", previousSku: "PAI-001-1" },
      },
    });

    const refusal = await runMigration();

    expect(refusal?.message).toContain(
      `1 × product.default_variant_changed (PAI-001-1 → PAI-001-2 le ${occurredAt.toISOString().slice(0, 10)})`,
    );
    expect(await written()).toEqual(UNTOUCHED);
  });

  it("refuse une journée de fournil ouverte qui porte une référence produit (D-a)", async () => {
    const day = daysAgo(-1).slice(0, 10);
    await ctx.prisma.productionDay.create({ data: { serviceDay: day } });
    await ctx.prisma.productionCount.create({
      data: { serviceDay: day, sku: "PAI-001", productName: "Baguette", quantity: 12 },
    });

    const refusal = await runMigration();

    expect(refusal?.message).toContain(`1 × journée de fournil ouverte (${day} PAI-001)`);
    expect(refusal).toBeInstanceOf(Error);
    expect(await written()).toEqual(UNTOUCHED);
  });

  it("laisse passer une journée CLOSE, qui garde sa référence", async () => {
    const day = daysAgo(1).slice(0, 10);
    await ctx.prisma.productionDay.create({
      data: { serviceDay: day, closedAt: new Date(daysAgo(0)) },
    });
    await ctx.prisma.productionCount.create({
      data: { serviceDay: day, sku: "PAI-001", productName: "Baguette", quantity: 12 },
    });

    expect(await runMigration()).toBeNull();
    const counts = await ctx.prisma.productionCount.findMany({ select: { sku: true } });
    expect(counts).toEqual([{ sku: "PAI-001" }]);
  });
});

describe("la bascule, sans refus", () => {
  it("écrit l'alias de chaque défaut et réécrit les magasins clés par référence de vente", async () => {
    await ctx.prisma.productNorm.create({
      data: {
        sku: "VIE-001",
        medianQuantity: 12,
        sampleLines: 6,
        windowDays: 180,
        computedAt: new Date(daysAgo(1)),
      },
    });

    expect(await runMigration()).toBeNull();

    const items = await ctx.prisma.catalogItem.count({ where: { isDefault: true } });
    expect(await ctx.prisma.saleSkuAlias.count()).toBe(items);
    expect(
      await ctx.prisma.saleSkuAlias.findUnique({
        where: { aliasSku: "PAI-001" },
        select: { targetSku: true },
      }),
    ).toEqual({ targetSku: "PAI-001-1" });
    expect(await written()).toEqual({ aliases: items, container: "PAI-001-1" });
    expect(await ctx.prisma.productNorm.findMany({ select: { sku: true } })).toEqual([
      { sku: "VIE-001-1" },
    ]);
  });

  it("se rejoue sans rien changer ni doubler", async () => {
    expect(await runMigration()).toBeNull();
    const first = await ctx.prisma.saleSkuAlias.findMany({ orderBy: { aliasSku: "asc" } });

    expect(await runMigration()).toBeNull();

    expect(await ctx.prisma.saleSkuAlias.findMany({ orderBy: { aliasSku: "asc" } })).toEqual(first);
    expect((await written()).container).toBe("PAI-001-1");
  });
});
