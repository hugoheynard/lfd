import { CATALOG_CATEGORY_ORDER } from "@lfd/contracts";

import { SeededProductCatalog } from "../seeded-product-catalog.js";

describe("SeededProductCatalog", () => {
  const catalog = new SeededProductCatalog();

  it("range CHAQUE SKU du seed — aucun préfixe inconnu", () => {
    // Le constructeur lève sur un préfixe non répertorié. Ce test est donc la
    // garde du seed : ajouter une famille de produits sans l'inscrire dans
    // CATEGORY_BY_PREFIX casse ici, pas au démarrage en production.
    expect(() => new SeededProductCatalog()).not.toThrow();
    expect(catalog.all().length).toBeGreaterThan(0);
  });

  it("rend le catalogue dans l'ordre de la vitrine", () => {
    const shelves = catalog.all().map((item) => CATALOG_CATEGORY_ORDER.indexOf(item.category));

    expect(shelves).toEqual([...shelves].sort((a, b) => a - b));
  });

  it("trie par nom à l'intérieur d'un rayon", () => {
    const pains = catalog
      .all()
      .filter((item) => item.category === "pain")
      .map((item) => item.name);

    expect(pains).toEqual([...pains].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("`all` et `resolve` parlent des mêmes articles — même prix, même TVA", () => {
    // Le piège que ce test ferme : un back-office qui afficherait une liste
    // construite autrement que l'autorité de prix du checkout. Un commercial
    // annoncerait alors au téléphone un tarif que le serveur refuse ensuite.
    for (const item of catalog.all()) {
      expect(catalog.resolve(item.sku)).toEqual(item);
    }
  });

  it("ignore un SKU inconnu plutôt que d'en inventer un", () => {
    expect(catalog.resolve("ZZZ-999")).toBeNull();
  });
});
