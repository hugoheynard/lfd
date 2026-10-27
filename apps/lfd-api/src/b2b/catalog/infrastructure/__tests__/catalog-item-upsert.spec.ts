import { Prisma } from "../../../../platform/database/client/client.js";
import { itemUpsertStatements, UPSERT_CHUNK, type ItemUpsertRow } from "../catalog-item-upsert.js";

/**
 * L'upsert en lot des articles : UNE instruction quel que soit le lot (en deçà
 * d'une tranche), valeurs paramétrées, colonnes « à la création seulement »
 * hors du `SET`.
 */

function row(index: number, overrides: Partial<ItemUpsertRow> = {}): ItemUpsertRow {
  return {
    sku: `LOT-${String(index)}-1`,
    name: `Article ${String(index)}`,
    priceMillicents: 100_000 + index,
    allergens: ["UW"],
    publicByContext: Prisma.DbNull,
    withdrawnAt: null,
    publicReviewPending: true,
    ...overrides,
  };
}

const rows = (count: number) => Array.from({ length: count }, (_, index) => row(index));

describe("itemUpsertStatements", () => {
  // P2028 (2026-10-17) : un upsert par article faisait expirer la transaction.
  it("rend une seule instruction pour 3 comme pour 70 articles", () => {
    const few = itemUpsertStatements(rows(3));
    const many = itemUpsertStatements(rows(70));

    expect(few).toHaveLength(1);
    expect(many).toHaveLength(1);
    expect(many[0]?.sql).toContain("ON CONFLICT (sku) DO UPDATE SET");
  });

  it("paramètre chaque valeur et n'écrit aucune donnée dans le texte SQL", () => {
    const [statement] = itemUpsertStatements([row(7, { name: "Pain'; DROP TABLE x;--" })]);

    expect(statement?.sql).not.toContain("DROP TABLE");
    expect(statement?.values).toContain("Pain'; DROP TABLE x;--");
  });

  it("écrit l'absence d'un jsonb en NULL et sérialise sa présence", () => {
    const [statement] = itemUpsertStatements([row(1)]);

    expect(statement?.sql).toContain("NULL");
    expect(statement?.values).toContain(JSON.stringify(["UW"]));
    expect(statement?.sql).toContain("::jsonb");
  });

  it("ne réécrit pas sur conflit une colonne de création seulement", () => {
    const [statement] = itemUpsertStatements(rows(2), ["publicReviewPending"]);

    expect(statement?.sql).toContain('"name" = EXCLUDED."name"');
    expect(statement?.sql).not.toContain('"public_review_pending" = EXCLUDED');
    expect(statement?.sql).not.toContain('"sku" = EXCLUDED');
  });

  it("n'écrit qu'une fois un SKU cité deux fois — le dernier", () => {
    const [statement] = itemUpsertStatements([
      row(1, { name: "avant" }),
      row(1, { name: "après" }),
    ]);

    expect(statement?.values).toContain("après");
    expect(statement?.values).not.toContain("avant");
  });

  it("découpe en tranches au-delà de la borne des paramètres", () => {
    expect(itemUpsertStatements(rows(UPSERT_CHUNK + 1))).toHaveLength(2);
  });

  it("ne rend rien pour un lot vide", () => {
    expect(itemUpsertStatements([])).toEqual([]);
  });

  /** `plan-prix-manquant-non-bloquant.md` (2026-10-27) : la colonne est nullable. */
  it("écrit un prix pro absent en NULL, jamais en zéro", () => {
    const [statement] = itemUpsertStatements([
      row(1, { priceMillicents: null, publicByContext: {} }),
    ]);

    expect(statement?.sql).toContain("NULL");
    expect(statement?.values).not.toContain(0);
  });
});
