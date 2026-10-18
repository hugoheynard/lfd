import { VitrineContents } from "../../vitrine-contents.js";
import { catalogue, item } from "../../__tests__/vitrine-fixtures.js";
import { vitrineCatalogueOf, vitrineTextsOf } from "../vitrine-view.js";

const ALL = VitrineContents.of(["catalogue", "operations", "texts", "featured"]);

describe("la vue d'un abonné", () => {
  it("toutes cases cochées, c'est la vue publique — la mise en avant comprise", () => {
    const view = vitrineCatalogueOf(catalogue(), ALL, "en");
    expect(view.language).toBe("en");
    expect(view.items.map((entry) => [entry.sku, entry.isFeatured])).toEqual([
      ["CRO-01", true],
      ["PAI-01", false],
    ]);
    expect(view.operations).toHaveLength(1);
  });

  it("sans « incontournables », isFeatured ne sort pas du tout", () => {
    const view = vitrineCatalogueOf(
      catalogue(),
      VitrineContents.of(["catalogue", "operations"]),
      "fr",
    );
    expect(view.items.every((entry) => !("isFeatured" in entry))).toBe(true);
  });

  it("une case décochée retire l'ensemble — et le renvoi d'un article à son opération", () => {
    const withOperation = catalogue({
      items: [item("GAL-01", { operation: { key: "galette", state: "open" } })],
    });
    const noOperations = vitrineCatalogueOf(withOperation, VitrineContents.of(["catalogue"]), "fr");
    expect(noOperations.operations).toEqual([]);
    expect(noOperations.items[0]).not.toHaveProperty("operation");

    const noCatalogue = vitrineCatalogueOf(withOperation, VitrineContents.of(["operations"]), "fr");
    expect(noCatalogue).toMatchObject({ items: [], shelves: [] });
    expect(noCatalogue.operations).toHaveLength(1);
  });

  it("n'élargit jamais : un article pro qui fuirait de la vue publique ne sort pas", () => {
    const leaked = catalogue({
      items: [item("PRO-01", { audience: "pro" }), item("BOTH-01", { audience: "both" })],
    });
    expect(vitrineCatalogueOf(leaked, ALL, "fr").items.map((entry) => entry.sku)).toEqual([
      "BOTH-01",
    ]);
  });

  it("les textes ne sortent qu'avec leur case", () => {
    const texts = { "product.bestSeller": "Incontournable" };
    expect(vitrineTextsOf(texts, ALL)).toEqual(texts);
    expect(vitrineTextsOf(texts, VitrineContents.of(["catalogue"]))).toEqual({});
  });
});
