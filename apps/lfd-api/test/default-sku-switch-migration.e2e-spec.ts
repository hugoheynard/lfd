/**
 * E2E de la **migration de bascule** — `20261029180000_le_defaut_se_vend_sous_sa_reference`,
 * rejouée (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, révision 3 :
 * sans alias, décision de Hugo du 2026-10-29).
 *
 * Ce que seul ce niveau prouve : le garde-fou compte dans les VRAIES tables,
 * un refus n'écrit RIEN (la transaction explicite du fichier s'annule
 * entière) ; sans refus, toute référence produit stockée passe sous la
 * référence du défaut — colonnes, listes, jsonb —, les collisions sont
 * refusées nommément, et le rejeu ne change rien.
 *
 * Le fichier est lu tel quel et joué par un client `pg` à part, en mode
 * `strict` (`SET LOCAL lfd.default_sku_switch_guard`) : la base de test est
 * l'une de celles où le garde-fou s'éteint. Les lignes d'AVANT la bascule
 * sont semées par Prisma, sous la référence produit : depuis la bascule,
 * aucune route n'en écrit plus.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";
import { testDatabaseUrl } from "./setup-env.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261029180000_le_defaut_se_vend_sous_sa_reference/migration.sql",
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
  await ctx.prisma.productionContainer.create({
    data: { sku: "PAI-001", unitsPerContainer: 25, singular: "manne", plural: "mannes" },
  });
});

const ROLLBACK = join(
  process.cwd(),
  "prisma/rollback/20261029180000_le_defaut_se_vend_sous_sa_reference.sql",
);

/** Joue le fichier, garde-fou forcé ; rend l'erreur levée, ou `null`. */
async function runMigration(file = MIGRATION): Promise<Error | null> {
  const sql = readFileSync(file, "utf8").replace(
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

/** Le contenant semé : il doit garder `PAI-001` sur un refus. */
async function containerSku(): Promise<string | null> {
  const container = await ctx.prisma.productionContainer.findFirst({ select: { sku: true } });
  return container?.sku ?? null;
}

/** Une commande d'avant la bascule, ses lignes sous ces références. */
async function seedOrder(orderNumber: string, skus: readonly string[]): Promise<string> {
  const company = await createCompany(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: `u_${orderNumber}` });
  const order = await ctx.prisma.order.create({
    data: {
      vatMethod: "line_ht",
      orderNumber,
      companyId: company.id,
      placedByUserId: user.id,
      status: "placed",
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
      requestedDeliveryDate: new Date(`${daysAgo(-2).slice(0, 10)}T00:00:00.000Z`),
      subtotalCents: 2_400 * skus.length,
      totalCents: 2_400 * skus.length,
      shortfallLines: [{ sku: "PAI-001", missing: 1 }],
      shortfallReportedAt: new Date(daysAgo(0)),
      lines: {
        create: skus.map((sku) => ({
          sku,
          productNameSnapshot: "Baguette",
          unitPriceMillicents: 120_000,
          quantity: 2,
          lineTotalCents: 2_400,
        })),
      },
    },
    select: { id: true },
  });
  return order.id;
}

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
    expect(await containerSku()).toBe("PAI-001");
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
    expect(await containerSku()).toBe("PAI-001");
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
    expect(await containerSku()).toBe("PAI-001");
  });

  it("refuse une commande qui porte les deux références, en la nommant, et n'écrit rien", async () => {
    const orderId = await seedOrder("ORD-910001", ["PAI-001", "PAI-001-1"]);

    const refusal = await runMigration();

    expect(refusal?.message).toContain(`1 × collision : commande (${orderId} PAI-001)`);
    const lines = await ctx.prisma.orderLine.findMany({
      where: { orderId },
      select: { sku: true },
      orderBy: { sku: "asc" },
    });
    expect(lines).toEqual([{ sku: "PAI-001" }, { sku: "PAI-001-1" }]);
    expect(await containerSku()).toBe("PAI-001");
  });
});

describe("le garde-fou de la bascule — l'alerte de stock vivante (index partiel)", () => {
  async function alert(siteId: string, sku: string, liftedAt: Date | null): Promise<void> {
    await ctx.prisma.siteStockAlert.create({
      data: {
        id: `alert_${sku}_${String(liftedAt !== null)}`,
        siteId,
        sku,
        label: "Baguette",
        level: "low",
        declaredAt: new Date(daysAgo(1)),
        declaredByStaffId: "staff",
        declaredByName: "Camille",
        declaredByRole: "vendeuse",
        ...(liftedAt === null
          ? {}
          : {
              liftedAt,
              liftedByStaffId: "staff",
              liftedByName: "Camille",
              liftedByRole: "vendeuse",
              liftReason: "manual",
            }),
      },
    });
  }

  async function site(): Promise<string> {
    const created = await ctx.prisma.site.create({
      data: {
        label: "Boutique",
        ligne1: "12 rue du Test",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      select: { id: true },
    });
    return created.id;
  }

  it("refuse deux alertes VIVANTES d'un site sous les deux références, en le nommant", async () => {
    const siteId = await site();
    await alert(siteId, "PAI-001", null);
    await alert(siteId, "PAI-001-1", null);

    const refusal = await runMigration();

    expect(refusal?.message).toContain(`1 × collision : alerte de stock (${siteId} PAI-001)`);
    expect(await containerSku()).toBe("PAI-001");
  });

  it("laisse passer une alerte levée à côté d'une vivante, et la réécrit", async () => {
    const siteId = await site();
    await alert(siteId, "PAI-001", new Date(daysAgo(2)));
    await alert(siteId, "PAI-001-1", null);

    expect(await runMigration()).toBeNull();

    const skus = await ctx.prisma.siteStockAlert.findMany({ select: { sku: true } });
    expect(skus).toEqual([{ sku: "PAI-001-1" }, { sku: "PAI-001-1" }]);
  });
});

describe("la bascule, sans refus", () => {
  it("réécrit la commande, son jsonb, le fournil et les réglages sous la référence du défaut", async () => {
    const orderId = await seedOrder("ORD-910002", ["PAI-001"]);
    const day = daysAgo(1).slice(0, 10);
    await ctx.prisma.productionDay.create({ data: { serviceDay: day } });
    await ctx.prisma.productionCount.create({
      data: { serviceDay: day, sku: "PAI-001", productName: "Baguette", quantity: 12 },
    });
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

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { shortfallLines: true, lines: { select: { sku: true } } },
    });
    expect(order.lines).toEqual([{ sku: "PAI-001-1" }]);
    expect(order.shortfallLines).toEqual([{ sku: "PAI-001-1", missing: 1 }]);
    expect(await ctx.prisma.productionCount.findMany({ select: { sku: true } })).toEqual([
      { sku: "PAI-001-1" },
    ]);
    expect(await containerSku()).toBe("PAI-001-1");
    expect(await ctx.prisma.productNorm.findMany({ select: { sku: true } })).toEqual([
      { sku: "VIE-001-1" },
    ]);
  });

  it("garde une valeur égale à une référence produit sous une autre clé que `sku`", async () => {
    const orderId = await seedOrder("ORD-910003", ["PAI-001"]);
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { shortfallLines: [{ sku: "PAI-001", productSku: "PAI-001", missing: 1 }] },
    });

    expect(await runMigration()).toBeNull();

    const { shortfallLines } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { shortfallLines: true },
    });
    expect(shortfallLines).toEqual([{ sku: "PAI-001-1", productSku: "PAI-001", missing: 1 }]);
  });

  it("se rejoue sans rien changer", async () => {
    const orderId = await seedOrder("ORD-910004", ["PAI-001"]);
    expect(await runMigration()).toBeNull();

    expect(await runMigration()).toBeNull();

    expect(
      await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { sku: true } }),
    ).toEqual([{ sku: "PAI-001-1" }]);
    expect(await containerSku()).toBe("PAI-001-1");
  });

  it("se défait par le retour arrière écrit, qui rend la référence produit", async () => {
    const orderId = await seedOrder("ORD-910005", ["PAI-001"]);
    expect(await runMigration()).toBeNull();

    expect(await runMigration(ROLLBACK)).toBeNull();

    expect(
      await ctx.prisma.orderLine.findMany({ where: { orderId }, select: { sku: true } }),
    ).toEqual([{ sku: "PAI-001" }]);
    expect(await containerSku()).toBe("PAI-001");
  });
});
