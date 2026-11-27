import { AllergenNaming } from "../../../../reference/allergens/domain/services/allergen-naming.js";
import {
  bareVariant,
  SELLABLE_VARIANT,
  tarte,
} from "../../../../catalogue/product/shared/__tests__/audience-doubles.js";
import type { CatalogFamilyRecord } from "../../domain/ports/catalog-facts.reader.js";
import { projectProductFact } from "../catalog-fact-projection.js";
import type { ProductFactInput } from "../catalog-facts.js";
import { CatalogProductChangedFact } from "../catalog-product-changed.fact.js";

/**
 * **Le fil porte l'audience de chaque déclinaison**
 * (`plan-audience-par-declinaison.md`, A5 et A6) : chaque déclinaison est
 * jugée et émise à SON audience effective, l'en-tête garde celle de la fiche.
 */

const FAMILY: CatalogFamilyRecord = {
  id: "cat_patisserie",
  name: { fr: "Pâtisserie" },
  slug: { fr: "patisserie" },
  parentId: null,
  position: 2,
  isArchived: false,
  audience: "both",
  vatByContext: { b2b: "rate_food", takeaway: "rate_food" },
};

const FORMULA = bareVariant({
  id: "prd_tarte_v2",
  sku: "PAT-7-2",
  name: { fr: "Formule" },
  isDefault: false,
  position: 1,
  priceCents: null,
  proPriceMillicents: null,
  allergenSheet: { declared: [], mayContain: [] },
});

function input(over: Partial<ProductFactInput> = {}): ProductFactInput {
  return {
    product: tarte({ status: "published" }),
    family: FAMILY,
    familyPercents: { b2b: 5.5, takeaway: 5.5 },
    percents: { b2b: 5.5, takeaway: 5.5 },
    rules: { activeContextKeys: ["b2b", "takeaway"] },
    naming: AllergenNaming.from([]),
    showcase: undefined,
    cited: [],
    catalogueUnion: [],
    detachedFromSku: null,
    variantOrigins: new Map(),
    optionGroups: new Map(),
    ...over,
  };
}

describe("projectProductFact — l'audience de chaque déclinaison", () => {
  it("une déclinaison `resupply` sans prix part vendable, à son audience — l'en-tête reste public", () => {
    const body = projectProductFact(
      input({
        product: tarte({
          status: "published",
          audience: "public",
          variants: [SELLABLE_VARIANT, { ...FORMULA, audience: "resupply" }],
        }),
      }),
    );

    expect(body.audience).toBe("public");
    expect(body.gaps).toEqual({});
    expect(body.variants.map((variant) => [variant.sku, variant.audience])).toEqual([
      ["PAT-7-1", "public"],
      ["PAT-7-2", "resupply"],
    ]);
  });

  it("une déclinaison `pro` d'une fiche publique sans prix pro part dans les manques", () => {
    const body = projectProductFact(
      input({
        product: tarte({
          status: "published",
          audience: "public",
          variants: [SELLABLE_VARIANT, { ...FORMULA, priceCents: 900, audience: "pro" }],
        }),
      }),
    );

    expect(body.gaps).toEqual({ "PAT-7-2": ["pro_price"] });
  });

  it("une déclinaison qui suit sa fiche part à l'audience effective de la fiche (famille comprise)", () => {
    const body = projectProductFact(input({ product: tarte({ status: "published" }) }));

    expect(body.variants[0]?.audience).toBe("both");
  });
});

describe("CatalogProductChangedFact — l'audience d'une déclinaison relue", () => {
  function payload(variantAudience: string | undefined): Record<string, unknown> {
    const body = projectProductFact(input());
    const rest = Object.fromEntries(
      Object.entries(body.variants[0] ?? {}).filter(([key]) => key !== "audience"),
    );
    return {
      productId: "prd_tarte",
      seq: 1,
      emittedAt: "2026-01-01T00:00:00.000Z",
      ...body,
      variants: [variantAudience === undefined ? rest : { ...rest, audience: variantAudience }],
    };
  }

  it("présente, elle se relit telle quelle", () => {
    const fact = CatalogProductChangedFact.fromPayload(payload("resupply"));
    expect(fact.body.variants[0]?.audience).toBe("resupply");
  });

  it("absente (fait d'avant le champ), elle se relit absente — le commerce prend l'en-tête", () => {
    const fact = CatalogProductChangedFact.fromPayload(payload(undefined));
    expect(fact.body.variants[0]?.audience).toBeUndefined();
  });
});
