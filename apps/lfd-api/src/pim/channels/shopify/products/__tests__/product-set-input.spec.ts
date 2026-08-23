import { buildProductSetInput } from "../product-set-input.js";
import type { ShopifyProductPayload } from "../projection.js";

function payload(over: Partial<ShopifyProductPayload> = {}): ShopifyProductPayload {
  return {
    title: "Croissant",
    handle: "croissant",
    status: "ACTIVE",
    descriptionHtml: "",
    vendor: null,
    seo: { title: "", description: "" },
    variants: [],
    ...over,
  };
}

describe("buildProductSetInput — description, SEO, marque", () => {
  it("envoie TOUJOURS la description et le SEO, vides compris", () => {
    const input = buildProductSetInput(payload());

    expect(input.descriptionHtml).toBe("");
    expect(input.seo).toEqual({ title: "", description: "" });
  });

  it("porte la description et le SEO projetés", () => {
    const input = buildProductSetInput(
      payload({
        descriptionHtml: "<p>Feuilletée.</p>",
        seo: { title: "T", description: "D" },
      }),
    );

    expect(input.descriptionHtml).toBe("<p>Feuilletée.</p>");
    expect(input.seo).toEqual({ title: "T", description: "D" });
  });

  // Shopify assigne un vendor par défaut ; ne rien déclarer ne doit pas l'écraser.
  it("omet la marque quand le référentiel n’en déclare pas", () => {
    expect("vendor" in buildProductSetInput(payload())).toBe(false);
  });

  it("envoie la marque quand elle est déclarée", () => {
    expect(buildProductSetInput(payload({ vendor: "Signature" })).vendor).toBe("Signature");
  });
});

describe("buildProductSetInput", () => {
  it("sans options → variante par défaut, prix inclus quand tarifé", () => {
    const input = buildProductSetInput(
      payload({
        variants: [
          {
            sku: "PATI-CROISSANT",
            title: "Défaut",
            options: {},
            price: "1.30",
          },
        ],
      }),
    );

    // Sans option, Shopify exige l'option par défaut Title + optionValues (F2/F4).
    expect(input.productOptions).toEqual([
      { name: "Title", position: 1, values: [{ name: "Default Title" }] },
    ]);
    expect(input.variants).toEqual([
      {
        sku: "PATI-CROISSANT",
        price: "1.30",
        optionValues: [{ optionName: "Title", name: "Default Title" }],
      },
    ]);
    expect(input.title).toBe("Croissant");
    expect(input.handle).toBe("croissant");
    expect(input.status).toBe("ACTIVE");
  });

  it("omet le prix quand la déclinaison n’est pas tarifée", () => {
    const input = buildProductSetInput(
      payload({
        variants: [{ sku: "PATI-CROISSANT", title: "Défaut", options: {}, price: null }],
      }),
    );

    expect(input.variants).toEqual([
      {
        sku: "PATI-CROISSANT",
        optionValues: [{ optionName: "Title", name: "Default Title" }],
      },
    ]);
  });

  it("avec options → productOptions déclarés + optionValues + prix par variante", () => {
    const input = buildProductSetInput(
      payload({
        variants: [
          {
            sku: "CAFE-250",
            title: "250 g",
            options: { Poids: "250 g" },
            price: "9.90",
          },
          {
            sku: "CAFE-1KG",
            title: "1 kg",
            options: { Poids: "1 kg" },
            price: "32.00",
          },
        ],
      }),
    );

    expect(input.productOptions).toEqual([
      {
        name: "Poids",
        position: 1,
        values: [{ name: "250 g" }, { name: "1 kg" }],
      },
    ]);
    expect(input.variants).toEqual([
      {
        sku: "CAFE-250",
        price: "9.90",
        optionValues: [{ optionName: "Poids", name: "250 g" }],
      },
      {
        sku: "CAFE-1KG",
        price: "32.00",
        optionValues: [{ optionName: "Poids", name: "1 kg" }],
      },
    ]);
  });
});
