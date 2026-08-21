import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { fingerprint, projectProduct } from "../projection.js";

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "p1",
    sku: "PATI-TARTE-FRAISE",
    name: { fr: "Tarte aux fraises" },
    slug: { fr: "tarte-aux-fraises" },
    kind: "made_to_order",
    categoryId: "c1",
    status: "draft",
    variants: [
      {
        id: "v1",
        sku: "PATI-TARTE-FRAISE-6P",
        name: { fr: "6 personnes" },
        options: { taille: "6 pers" },
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 2400,
        weightGrams: null,
        allergens: null,
        nutrition: null,
      },
    ],
    ...overrides,
  };
}

describe("projection Shopify", () => {
  it("projette le nom, l’identifiant d’URL et les déclinaisons", () => {
    const payload = projectProduct(product());

    expect(payload.title).toBe("Tarte aux fraises");
    expect(payload.handle).toBe("tarte-aux-fraises");
    expect(payload.variants).toHaveLength(1);
    expect(payload.variants[0]?.sku).toBe("PATI-TARTE-FRAISE-6P");
    // Centimes canoniques → décimal texte Shopify.
    expect(payload.variants[0]?.price).toBe("24.00");
  });

  it("laisse le prix à null quand la déclinaison n’est pas tarifée", () => {
    const untarifed = product({
      variants: [{ ...product().variants[0]!, priceCents: null }],
    });

    expect(projectProduct(untarifed).variants[0]?.price).toBeNull();
  });

  // Le garde-fou qui compte : on ne met jamais un brouillon en ligne par inadvertance.
  it.each([
    ["draft", "DRAFT"],
    ["archived", "DRAFT"],
    ["published", "ACTIVE"],
  ] as const)("statut %s → %s", (status, expected) => {
    expect(projectProduct(product({ status })).status).toBe(expected);
  });

  it("omet les déclinaisons retirées de la vente", () => {
    const withRetired = product({
      variants: [
        { ...product().variants[0]!, id: "v2", isDiscontinued: true },
        product().variants[0]!,
      ],
    });

    expect(projectProduct(withRetired).variants).toHaveLength(1);
  });

  describe("empreinte", () => {
    it("est stable pour un contenu identique", () => {
      expect(fingerprint(projectProduct(product()))).toBe(fingerprint(projectProduct(product())));
    });

    // Sans tri des clés, deux objets équivalents produiraient deux empreintes :
    // tout paraîtrait modifié en permanence et on repousserait sans cesse.
    it("ignore l’ordre des clés d’options", () => {
      const first = product({
        variants: [
          {
            ...product().variants[0]!,
            options: { taille: "6 pers", parfum: "fraise" },
          },
        ],
      });
      const second = product({
        variants: [
          {
            ...product().variants[0]!,
            options: { parfum: "fraise", taille: "6 pers" },
          },
        ],
      });

      expect(fingerprint(projectProduct(first))).toBe(fingerprint(projectProduct(second)));
    });

    it("change dès que le contenu poussé change", () => {
      const renamed = product({ name: { fr: "Tarte aux framboises" } });

      expect(fingerprint(projectProduct(product()))).not.toBe(fingerprint(projectProduct(renamed)));
    });
  });
});
