import { InMemoryProductCatalog } from "../../../catalog/infrastructure/in-memory-product-catalog.js";
import { scopeNameOf } from "../scope-names.js";

/**
 * Le nom qu'une phrase tarifaire fige pour ce qu'elle vise (plan des phrases
 * du journal, lot B) — lu, jamais inventé.
 */

const catalog = new InMemoryProductCatalog([
  {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 220_000,
    vatRate: 5.5,
    category: "viennoiserie",
    allergens: null,
    orderTimeLimit: null,
  },
]);

describe("scopeNameOf", () => {
  it("ne nomme rien pour tout le catalogue", async () => {
    expect(await scopeNameOf({ type: "global", id: null }, catalog)).toBeNull();
  });

  it("nomme un rayon par son libellé", async () => {
    expect(await scopeNameOf({ type: "category", id: "viennoiserie" }, catalog)).toBe(
      "Viennoiseries",
    );
  });

  it("rend `null` pour un code de rayon inconnu — la phrase garde alors l'identifiant", async () => {
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
