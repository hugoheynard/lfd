import { productPath, productUrl } from "../product-path.js";

describe("productPath", () => {
  it("compose /boutique/article/<sku>", () => {
    expect(productPath("P-BDMCRD")).toBe("/boutique/article/P-BDMCRD");
  });

  it("encode le SKU", () => {
    expect(productPath("A/B C&D")).toBe("/boutique/article/A%2FB%20C%26D");
  });
});

describe("productUrl", () => {
  it("préfixe l'origine, sans barre doublée", () => {
    expect(productUrl("https://lafoliedouce.fr/", "P-1")).toBe(
      "https://lafoliedouce.fr/boutique/article/P-1",
    );
  });

  it("rend null sans origine : jamais une adresse inventée", () => {
    expect(productUrl(null, "P-1")).toBeNull();
    expect(productUrl("", "P-1")).toBeNull();
  });
});
