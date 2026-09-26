import { InMemoryProductCatalog } from "../../../catalog/infrastructure/in-memory-product-catalog.js";
import { family, VIENNOISERIES } from "../../../catalog/domain/__tests__/families.fixture.js";
import { scopeNameOf } from "../scope-names.js";

/**
 * Le nom qu'une phrase tarifaire fige pour ce qu'elle vise (plan des phrases
 * du journal, lot B) — lu, jamais inventé.
 */

const SNACKING = family("01a0-snacking", "Snacking", 5);

const catalog = new InMemoryProductCatalog([
  {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 220_000,
    vatRate: 5.5,
    family: VIENNOISERIES,
    allergens: null,
    orderTimeLimit: null,
  },
  {
    sku: "SNK-001",
    name: "Wrap",
    unitPriceMillicents: 450_000,
    vatRate: 5.5,
    family: SNACKING,
    allergens: null,
    orderTimeLimit: null,
  },
]);

describe("scopeNameOf", () => {
  it("ne nomme rien pour tout le catalogue", async () => {
    expect(await scopeNameOf({ type: "global", id: null }, catalog)).toBeNull();
  });

  it("nomme une famille par son nom au référentiel", async () => {
    expect(await scopeNameOf({ type: "category", id: "fam-vien" }, catalog)).toBe("Viennoiseries");
  });

  it("nomme une famille qu'aucun code ne connaît — elle est une donnée", async () => {
    expect(await scopeNameOf({ type: "category", id: "01a0-snacking" }, catalog)).toBe("Snacking");
  });

  it("nomme une portée passée en ancien code de rayon par son libellé d'alors", async () => {
    // Les sujets du journal et les traces figées gardent leurs clés d'avant le
    // 2026-09-26 : `legacy-shelf-codes.ts` est leur seul lecteur.
    expect(await scopeNameOf({ type: "category", id: "chocolat" }, catalog)).toBe(
      "Chocolat & confiserie",
    );
  });

  it("rend `null` pour une famille inconnue — la phrase garde alors l'identifiant", async () => {
    expect(await scopeNameOf({ type: "category", id: "inconnu" }, catalog)).toBeNull();
  });

  it("nomme un article par son nom au catalogue", async () => {
    expect(await scopeNameOf({ type: "product", id: "VIE-001" }, catalog)).toBe("Croissant");
    expect(await scopeNameOf({ type: "variant", id: "VIE-001" }, catalog)).toBe("Croissant");
  });

  it("rend `null` pour un article que le catalogue ne rend plus — la phrase garde son SKU", async () => {
    expect(await scopeNameOf({ type: "product", id: "VIE-999" }, catalog)).toBeNull();
  });
});
