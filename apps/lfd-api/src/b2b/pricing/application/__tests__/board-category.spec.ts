import { catalogueArticle } from "../../../catalog/domain/catalogue-article.js";
import type { CatalogFamily } from "../../../catalog/domain/catalog-family.js";
import type { CatalogItem } from "../../../catalog/domain/ports/product-catalog.reader.js";
import {
  family,
  PAINS,
  PATISSERIES,
  VIENNOISERIES,
} from "../../../catalog/domain/__tests__/families.fixture.js";
import { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ruleFromRow, ruleViewFromRow, type RuleRow } from "../../infrastructure/price-rows.js";
import type { PriceScope } from "../../domain/price-rule.js";
import { boardMaterials } from "../board-item.js";
import { categoryView, groupByFamily } from "../board-category.js";
import type { LoadedRule } from "../ports/pricing-decisions.reader.js";

/**
 * **Les bandes du tableau de tarification**, depuis que la famille est une
 * donnée (plan des familles en données, 2026-09-26) : une famille livrée par
 * le référentiel devient une bande sans déploiement, une famille orpheline du
 * miroir n'en a pas, et la hiérarchie s'applique au prix.
 *
 * Dates absolues, exception du §5 de `CLAUDE.md` : l'instant de lecture est
 * passé en argument, rien n'est comparé à l'horloge.
 */
const AT = new Date("2026-08-17T00:00:00.000Z");
const TARTES = family("fam-tartes", "Tartes", 3, [PATISSERIES.id]);

function article(sku: string, of: CatalogFamily | null): CatalogItem {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 200_000,
    vatRate: 5.5,
    family: of,
    allergens: null,
    orderTimeLimit: null,
    article: catalogueArticle({
      sku,
      name: sku,
      categoryPath: of?.path ?? [],
      unitPriceMillicents: 200_000,
    }),
  };
}

function familyRule(id: string, scope: PriceScope, bp: number): LoadedRule {
  const row: RuleRow = {
    stacksOverMercuriale: false,
    id,
    stage: "promotion",
    nature: "alter",
    scopeType: scope.type,
    scopeId: scope.id,
    audienceType: "all",
    audienceId: null,
    minQuantity: null,
    amountMillicents: null,
    direction: "decrease",
    mode: "percent",
    value: bp,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
    label: id,
    createdBy: "staff|test",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };
  return { rule: ruleFromRow(row), view: ruleViewFromRow(row, StaffAuthors.none()) };
}

const NOTHING_AT_CATALOGUE = { rules: [], ladders: [] };

describe("groupByFamily", () => {
  it("range dans l'ordre du référentiel — position, puis nom", () => {
    const shelves = groupByFamily([
      article("PAI-001", PAINS),
      article("TAR-001", TARTES),
      article("VIE-001", VIENNOISERIES),
    ]);

    expect(shelves.map((shelf) => shelf.family.id)).toEqual(["fam-vien", "fam-pain", "fam-tartes"]);
  });

  it("fait une bande d'une famille qu'aucun code ne connaît", () => {
    const snacking = family("01a0-snacking", "Snacking", 5);

    const shelves = groupByFamily([article("SNK-001", snacking)]);

    expect(shelves.map((shelf) => shelf.family.name)).toEqual(["Snacking"]);
  });

  /**
   * Les familles orphelines du miroir (les `cat_*` que la projection ne
   * supprime jamais) ne portent aucun article vivant : elles ne naissent pas
   * ici, puisque les bandes naissent des articles.
   */
  it("ne montre que les familles qui portent un article, et pas celles sans famille", () => {
    const shelves = groupByFamily([article("VIE-001", VIENNOISERIES), article("XXX-001", null)]);

    expect(shelves).toHaveLength(1);
    expect(shelves[0]?.articles.map((item) => item.sku)).toEqual(["VIE-001"]);
  });
});

describe("categoryView", () => {
  it("porte la famille du référentiel, son nom et sa position", async () => {
    const materials = await boardMaterials([], [], AT);

    const view = categoryView(
      VIENNOISERIES,
      [article("VIE-001", VIENNOISERIES)],
      { rules: [], floors: [], ladders: [] },
      materials,
      NOTHING_AT_CATALOGUE,
      AT,
    );

    expect(view).toMatchObject({
      id: "fam-vien",
      name: "Viennoiseries",
      family: { id: "fam-vien", name: "Viennoiseries", position: 0 },
    });
  });

  it("tarifie une sous-famille avec la règle de sa parente, la plus proche l'emporte", async () => {
    const parente = familyRule("parente", { type: "category", id: PATISSERIES.id }, 1_000);
    const proche = familyRule("proche", { type: "category", id: TARTES.id }, 2_000);
    const rules = [parente, proche];
    const materials = await boardMaterials(rules, [], AT);

    const view = categoryView(
      TARTES,
      [article("TAR-001", TARTES)],
      { rules, floors: [], ladders: [] },
      materials,
      NOTHING_AT_CATALOGUE,
      AT,
    );

    // −20 % de la sous-famille, et pas −10 % de la parente : 200 → 160.
    expect(view.items[0]?.finalMillicents).toBe(160_000);
    // La bande ne liste que SES règles ; la parente redescend sans y être posée.
    expect(view.rules.map((rule) => rule.id)).toEqual(["proche"]);
  });

  it("applique la règle de la parente quand la sous-famille n'en a pas", async () => {
    const rules = [familyRule("parente", { type: "category", id: PATISSERIES.id }, 1_000)];
    const materials = await boardMaterials(rules, [], AT);

    const view = categoryView(
      TARTES,
      [article("TAR-001", TARTES)],
      { rules, floors: [], ladders: [] },
      materials,
      NOTHING_AT_CATALOGUE,
      AT,
    );

    expect(view.items[0]?.finalMillicents).toBe(180_000);
  });
});
