/**
 * E2E de la **migration du journal** — `20261030100000_le_journal_parle_la_reference_de_vente`,
 * rejouée (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 16 :
 * décision de Hugo du 2026-10-30, sur le précédent `tax_rate.*` → `vat_rate.*`).
 *
 * Ce que seul ce niveau prouve : sur le VRAI `growth.activity_events`, un fait
 * semé sous la référence produit (`PAI-001`) se relit sous celle du défaut
 * (`PAI-001-1`) aux chemins inventoriés — et seulement là : la fiche d'un
 * fait `product.*` et une clé autre que la référence restent telles
 * qu'écrites. Le rejeu ne change rien ; le retour arrière écrit rend
 * `PAI-001`.
 *
 * Les faits d'AVANT la bascule sont semés par Prisma : aucune route n'écrit
 * plus de référence produit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { testDatabaseUrl } from "./setup-env.js";

const NAME = "20261030100000_le_journal_parle_la_reference_de_vente";
const MIGRATION = join(process.cwd(), `prisma/migrations/${NAME}/migration.sql`);
const ROLLBACK = join(process.cwd(), `prisma/rollback/${NAME}.sql`);

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Joue le fichier ; rend l'erreur levée, ou `null`. */
async function run(file = MIGRATION): Promise<Error | null> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query(readFileSync(file, "utf8"));
    return null;
  } catch (error) {
    await client.query("ROLLBACK");
    return error instanceof Error ? error : new Error(String(error));
  } finally {
    await client.end();
  }
}

/** Un fait d'avant la bascule ; rend son id. */
async function seedFact(
  type: string,
  subjectType: string,
  subjectId: string,
  payload: InputJsonObject,
): Promise<string> {
  sequence += 1;
  const id = `evt_journal_${String(sequence).padStart(6, "0")}`;
  await ctx.prisma.activityEvent.create({
    data: {
      id,
      type,
      occurredAt: new Date(daysAgo(2)),
      subjectType,
      subjectId,
      actorType: "staff",
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${id}`,
      payload,
    },
  });
  return id;
}

async function fact(id: string): Promise<{ subjectId: string; payload: unknown }> {
  return ctx.prisma.activityEvent.findUniqueOrThrow({
    where: { id },
    select: { subjectId: true, payload: true },
  });
}

describe("le journal parle la référence de vente", () => {
  it("relit sous le défaut un contenant et des lignes, sans toucher un fait `catalog_item`", async () => {
    // Toujours rangé sous la référence de déclinaison : ni l'aller ni le retour n'y touchent.
    const hidden = await seedFact("catalog_item.hidden", "catalog_item", "PAI-001-1", {
      subjectLabel: "Baguette",
      sku: "PAI-001-1",
    });
    const filled = await seedFact("packing_container.filled", "order", "ord_1", {
      subjectLabel: "ORD-1",
      container: { id: "c1", name: "sac" },
      sku: "PAI-001",
      productName: "Baguette",
      quantity: 2,
    });
    const overridden = await seedFact("subscription.occurrence_overridden", "subscription", "s1", {
      date: daysAgo(-3).slice(0, 10),
      before: null,
      after: { skipped: false, lines: [{ sku: "PAI-001", quantity: 3 }] },
    });

    expect(await run()).toBeNull();

    expect(await fact(hidden)).toEqual({
      subjectId: "PAI-001-1",
      payload: { subjectLabel: "Baguette", sku: "PAI-001-1" },
    });
    expect((await fact(filled)).payload).toMatchObject({ sku: "PAI-001-1" });
    expect((await fact(overridden)).payload).toMatchObject({
      before: null,
      after: { lines: [{ sku: "PAI-001-1", quantity: 3 }] },
    });
  });

  it("réécrit les listes avant → après et le libellé qui EST la référence", async () => {
    const selection = await seedFact(
      "catalog_operation.selection_saved",
      "catalog_operation",
      "op",
      {
        subjectLabel: "Noël",
        skus: { from: ["PAI-001"], to: ["VIE-001-1", "PAI-001"] },
      },
    );
    const container = await seedFact(
      "production_container.set",
      "production_container",
      "PAI-001",
      {
        subjectLabel: "PAI-001",
        before: null,
        after: { unitsPerContainer: 25, singular: "manne", plural: "mannes" },
      },
    );

    expect(await run()).toBeNull();

    expect((await fact(selection)).payload).toMatchObject({
      skus: { from: ["PAI-001-1"], to: ["VIE-001-1", "PAI-001-1"] },
    });
    expect(await fact(container)).toMatchObject({
      subjectId: "PAI-001-1",
      payload: { subjectLabel: "PAI-001-1" },
    });
  });

  it("garde la fiche d'un fait `product.*` et une clé autre que la référence", async () => {
    const published = await seedFact("product.published", "product", "prd_1", {
      subjectLabel: "Baguette",
      sku: "PAI-001",
      name: { fr: "Baguette" },
      blast: {},
    });
    const shortfall = await seedFact("order.shortfall_decided", "company", "cmp_1", {
      orderId: "ord_1",
      orderNumber: "PAI-001",
      decidedBy: "stf_1",
      departing: [{ sku: "PAI-001", quantity: 1 }],
      remainder: "abandoned",
    });

    expect(await run()).toBeNull();

    expect((await fact(published)).payload).toMatchObject({ sku: "PAI-001" });
    expect((await fact(shortfall)).payload).toMatchObject({
      orderNumber: "PAI-001",
      departing: [{ sku: "PAI-001-1", quantity: 1 }],
    });
  });

  it("se rejoue sans rien changer, et se défait par le retour arrière écrit", async () => {
    const id = await seedFact("delivery_bin_capacity.set", "delivery_bin", "bin_1", {
      subjectLabel: "Bac",
      sku: "PAI-001",
      before: null,
      after: 12,
    });
    expect(await run()).toBeNull();

    expect(await run()).toBeNull();
    expect((await fact(id)).payload).toMatchObject({ sku: "PAI-001-1" });

    const item = await seedFact("catalog_item.shown", "catalog_item", "PAI-001-1", {
      subjectLabel: "Baguette",
      sku: "PAI-001-1",
    });
    expect(await run(ROLLBACK)).toBeNull();
    expect((await fact(id)).payload).toMatchObject({ sku: "PAI-001" });
    expect(await fact(item)).toEqual({
      subjectId: "PAI-001-1",
      payload: { subjectLabel: "Baguette", sku: "PAI-001-1" },
    });
  });
});
