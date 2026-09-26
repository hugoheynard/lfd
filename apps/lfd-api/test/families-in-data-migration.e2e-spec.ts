/**
 * E2E de la migration **`les_familles_se_lisent_en_donnees`**, sur le vrai
 * Postgres (`documentation/pricing/plan-familles-en-donnees.md`, « Lots 1 à 3
 * réunis », point 5, et §4).
 *
 * Elle reprend les décisions de portée famille posées en CODE de rayon
 * (`viennoiserie`) : code → slug → id de la famille dans `catalog_categories`.
 * Ces cas la rejouent sur une base semée des codes, sur une base qui n'en a
 * aucun, et avec un code sans cible.
 *
 * Les décisions sont écrites en SQL, et c'est leur sujet : la migration lit la
 * base, et une décision en code ne peut plus être posée par l'application.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { OrderQuoteView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260926140000_les_familles_se_lisent_en_donnees/migration.sql",
);

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Le bloc de la migration — lu dans le fichier, jamais recopié. */
function migration(): string {
  const block = /DO \$\$[\s\S]*END \$\$;/u.exec(readFileSync(MIGRATION, "utf8"))?.[0];
  if (block === undefined) {
    throw new Error("La migration ne porte plus son bloc `DO $$ … END $$;`.");
  }
  return block;
}

async function replay(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(migration());
}

/** Une règle de −50 % sur une portée, active depuis hier. */
async function insertRule(id: string, scopeType: string, scopeId: string | null): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `INSERT INTO "public"."price_rules"
       ("id", "stage", "nature", "scope_type", "scope_id", "audience_type", "direction", "mode",
        "value", "valid_from", "label", "created_by")
     VALUES ($1, 'promotion', 'alter', $2, $3, 'all', 'decrease', 'percent', 5000,
             $4::timestamptz, 'e2e', 'e2e')`,
    id,
    scopeType,
    scopeId,
    daysAgo(1),
  );
}

async function scopeIdOf(table: string, id: string): Promise<string | null> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ scope_id: string | null }[]>(
    `SELECT "scope_id" FROM "public"."${table}" WHERE "id" = $1`,
    id,
  );
  return rows[0]?.scope_id ?? null;
}

/** Une décision de chaque table, en code de rayon — une archivée comprise. */
async function seedCodes(companyId: string): Promise<void> {
  await insertRule("rule_vien", "category", "viennoiserie");
  await insertRule("rule_prod", "product", "VIE-001");
  await insertRule("rule_archived", "category", "chocolat");
  await ctx.prisma.priceRule.update({
    where: { id: "rule_archived" },
    data: { archivedAt: new Date(daysAgo(0)), archivedBy: "e2e", archiveReason: "fin" },
  });
  await ctx.prisma.priceFloor.create({
    data: {
      id: "floor_pain",
      scopeType: "category",
      scopeId: "pain",
      mode: "percent",
      value: 5_000,
      createdBy: "e2e",
      validFrom: new Date(daysAgo(30)),
    },
  });
  await ctx.prisma.volumeLadder.create({
    data: {
      id: "ladder_patis",
      scopeType: "category",
      scopeId: "patisserie",
      audienceType: "all",
      unit: "piece",
      tiers: [],
      label: "e2e",
      validFrom: new Date(daysAgo(30)),
      createdBy: "e2e",
    },
  });
  await ctx.prisma.volumeCommitment.create({
    data: {
      id: "commit_sale",
      companyId,
      scopeType: "category",
      scopeId: "sale",
      promisedQuantity: 100,
      validFrom: new Date(daysAgo(30)),
      validTo: new Date(daysAgo(-30)),
      createdBy: "e2e",
    },
  });
}

async function unitPriceOf(companyId: string, sku: string): Promise<number> {
  const quote = jsonBody<OrderQuoteView>(
    await ctx
      .asSub("staff-e2e")
      .post("/admin/orders/quote")
      .send({ companyId, lines: [{ sku, quantity: 1 }] })
      .expect(200),
  );
  const line = quote.lines[0];
  if (line === undefined) {
    throw new Error(`devis sans ligne pour ${sku}`);
  }
  return line.unitPriceMillicents;
}

describe("la migration sur une base semée de codes de rayon", () => {
  it("réécrit chaque décision de portée famille, archivées comprises, et elles seules", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await seedCodes(company.id);

    await replay();

    expect(await scopeIdOf("price_rules", "rule_vien")).toBe(E2E_FAMILIES.VIE.id);
    expect(await scopeIdOf("price_rules", "rule_archived")).toBe(E2E_FAMILIES.CHO.id);
    expect(await scopeIdOf("price_floors", "floor_pain")).toBe(E2E_FAMILIES.PAI.id);
    expect(await scopeIdOf("volume_ladders", "ladder_patis")).toBe(E2E_FAMILIES.PAT.id);
    expect(await scopeIdOf("volume_commitments", "commit_sale")).toBe(E2E_FAMILIES.SAL.id);
    // Une portée d'article n'est pas une famille : elle ne bouge pas.
    expect(await scopeIdOf("price_rules", "rule_prod")).toBe("VIE-001");
  });

  /**
   * Le prix d'avant se facturait avec la règle posée en code ; celui d'après
   * avec la même règle reprise sur l'id. Les deux doivent coïncider : c'est ce
   * que la même décision, posée directement sur la famille, facture.
   */
  it("rend le prix identique à celui de la même décision posée sur la famille", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await insertRule("rule_direct", "category", E2E_FAMILIES.VIE.id);
    const expected = await unitPriceOf(company.id, "VIE-001");
    await ctx.prisma.priceRule.delete({ where: { id: "rule_direct" } });

    await insertRule("rule_code", "category", "viennoiserie");
    await replay();

    expect(await unitPriceOf(company.id, "VIE-001")).toBe(expected);
    expect(expected).toBeLessThan(await unitPriceOf(company.id, "PAI-001"));
  });

  it("préfère l'id réel au `cat_*` orphelin qui porte le même slug", async () => {
    await ctx.prisma.catalogCategory.create({
      data: {
        id: "cat_vien",
        name: "Viennoiseries",
        slug: E2E_FAMILIES.VIE.slug,
        position: 0,
        receivedAt: new Date(daysAgo(90)),
      },
    });
    await insertRule("rule_vien", "category", "viennoiserie");

    await replay();

    expect(await scopeIdOf("price_rules", "rule_vien")).toBe(E2E_FAMILIES.VIE.id);
  });

  it("est rejouable : une seconde passe ne trouve plus rien", async () => {
    await insertRule("rule_vien", "category", "viennoiserie");
    await replay();

    await replay();

    expect(await scopeIdOf("price_rules", "rule_vien")).toBe(E2E_FAMILIES.VIE.id);
  });
});

describe("la migration sur une base sans code de rayon", () => {
  it("ne touche à rien", async () => {
    await insertRule("rule_id", "category", E2E_FAMILIES.PAI.id);
    await insertRule("rule_glob", "global", null);

    await replay();

    expect(await scopeIdOf("price_rules", "rule_id")).toBe(E2E_FAMILIES.PAI.id);
    expect(await scopeIdOf("price_rules", "rule_glob")).toBeNull();
  });
});

describe("la migration face à un code sans cible unique", () => {
  it("échoue en nommant le code, quand aucune famille n'a son slug", async () => {
    await ctx.prisma.catalogCategory.update({
      where: { id: E2E_FAMILIES.CHO.id },
      data: { slug: "chocolats-renommes" },
    });
    await insertRule("rule_choco", "category", "chocolat");

    await expect(replay()).rejects.toThrow(/« chocolat »/u);
    expect(await scopeIdOf("price_rules", "rule_choco")).toBe("chocolat");
  });

  it("échoue en nommant le code, quand deux familles réelles portent son slug", async () => {
    await ctx.prisma.catalogCategory.create({
      data: {
        id: "01a031ff-146f-756f-a21b-4a2759a35e85",
        name: "Viennoiseries",
        slug: E2E_FAMILIES.VIE.slug,
        position: 7,
        receivedAt: new Date(daysAgo(1)),
      },
    });
    await insertRule("rule_vien", "category", "viennoiserie");

    await expect(replay()).rejects.toThrow(/« viennoiserie » n'a pas de famille unique/u);
  });
});
