import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { family, VIENNOISERIES } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { ListCatalogHandler } from "../list-catalog.handler.js";

/**
 * **Le catalogue servi aux écrans** : la famille du référentiel, et le champ
 * déprécié qui reste servi à `null` (plan des familles en données, 2026-09-26).
 */
function item(sku: string, of: ReturnType<typeof family> | null) {
  return {
    sku,
    name: sku,
    unitPriceMillicents: 220_000,
    vatRate: 5.5,
    family: of,
    allergens: null,
    orderTimeLimit: null,
  };
}

describe("ListCatalogHandler", () => {
  /**
   * Sans slug. La racine et le chemin y voyagent depuis le 2026-10-30 (Hugo) :
   * le fournil range par catégorie racine. Une famille sans parente nommée
   * est sa propre racine.
   */
  it("sert la famille sans son slug — id, nom, position, racine et chemin", async () => {
    const tartes = family("fam-tartes", "Tartes", 3, ["fam-patis"]);
    const handler = new ListCatalogHandler(new InMemoryProductCatalog([item("TAR-001", tartes)]));

    const [view] = await handler.execute();

    expect(view?.family).toEqual({
      id: "fam-tartes",
      name: "Tartes",
      position: 3,
      root: { id: "fam-tartes", name: "Tartes", position: 3 },
      path: ["fam-tartes", "fam-patis"],
    });
  });

  it("sert pour racine la plus lointaine des parentes", async () => {
    const fine = {
      ...family("fam-vien-fine", "Viennoiserie fine", 2, ["fam-vien"]),
      ancestors: [{ id: "fam-vien", name: "Viennoiserie", position: 0, nameTranslations: {} }],
    };
    const handler = new ListCatalogHandler(new InMemoryProductCatalog([item("VIE-010", fine)]));

    const [view] = await handler.execute();

    expect(view?.family?.root).toEqual({ id: "fam-vien", name: "Viennoiserie", position: 0 });
  });

  /**
   * Le front déjà déployé range un `null` sous « Sans famille connue », mais
   * PERD un article dont le champ est absent : le champ déprécié reste servi,
   * et toujours à `null`, jusqu'à ce qu'aucun front ne le lise.
   */
  it("sert `category` présent et toujours à `null`", async () => {
    const handler = new ListCatalogHandler(
      new InMemoryProductCatalog([item("VIE-001", VIENNOISERIES), item("XXX-001", null)]),
    );

    const views = await handler.execute();

    expect(views.map((view) => Object.hasOwn(view, "category"))).toEqual([true, true]);
    expect(views.map((view) => view.category)).toEqual([null, null]);
    expect(views.map((view) => view.family?.id ?? null)).toEqual(["fam-vien", null]);
  });

  /** P5 (`vente-au-poids.md`) : la saisie du back-office doit savoir qu'un prix est au kilo. */
  it("sert l'unité de vente, le pas et le minimum — une pièce n'en a pas", async () => {
    const handler = new ListCatalogHandler(
      new InMemoryProductCatalog([
        item("VIE-001", VIENNOISERIES),
        { ...item("SAU-001", null), saleUnit: "weight", weightStepGrams: 100, weightMinGrams: 200 },
      ]),
    );

    const views = await handler.execute();

    expect(
      views.map(({ sku, saleUnit, weightStepGrams, weightMinGrams }) => ({
        sku,
        saleUnit,
        weightStepGrams,
        weightMinGrams,
      })),
    ).toEqual([
      { sku: "VIE-001", saleUnit: "piece", weightStepGrams: null, weightMinGrams: null },
      { sku: "SAU-001", saleUnit: "weight", weightStepGrams: 100, weightMinGrams: 200 },
    ]);
  });
});
