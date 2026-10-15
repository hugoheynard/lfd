import type { ProPricePolicy } from "@lfd/pim-contracts";

import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
import {
  bareVariant,
  SELLABLE_VARIANT,
  tarte,
} from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import type { CatalogFamilyRecord } from "../../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { CompletenessRules } from "../../../../catalogue/product/domain/services/variant-completeness.js";
import { projectFamilyFact, projectProductFact, type ProductFactInput } from "../catalog-facts.js";

/**
 * La projection d'une fiche en instantané (2a1) — pure, et c'est elle qui
 * décide ce qui se vend : une déclinaison incomplète part dans `gaps`, jamais
 * dans les vendables (C1).
 */

const POLICY: ProPricePolicy = { method: "ratio_ttc", ratioBp: 10_000 };
/** Le seul contexte b2b en service : la fiche par défaut est complète. */
const B2B_ONLY: CompletenessRules = { activeContextKeys: ["b2b"], policy: POLICY };
const PRO_ONLY: CategoryVatPercents = { b2b: 5.5 };
const BOTH_CONTEXTS: CategoryVatPercents = { b2b: 5.5, takeaway: 5.5 };
const NO_ALLERGEN_REFERENCE = IncoProjector.from([], "fr");

function family(over: Partial<CatalogFamilyRecord> = {}): CatalogFamilyRecord {
  return {
    id: "cat_patisserie",
    name: { fr: "Pâtisserie" },
    slug: { fr: "patisserie" },
    parentId: null,
    position: 2,
    isArchived: false,
    audience: "pro",
    vatByContext: { b2b: "rate_food" },
    ...over,
  };
}

function input(over: Partial<ProductFactInput> = {}): ProductFactInput {
  return {
    product: tarte({ status: "published" }),
    family: family(),
    familyPercents: PRO_ONLY,
    percents: PRO_ONLY,
    rules: B2B_ONLY,
    inco: NO_ALLERGEN_REFERENCE,
    showcase: undefined,
    ...over,
  };
}

describe("projectProductFact", () => {
  it("vend une déclinaison complète, au prix pro hors taxe que le push calculerait", () => {
    const body = projectProductFact(input());

    expect(body.status).toBe("active");
    expect(body.audience).toBe("pro");
    expect(body.gaps).toEqual({});
    expect(body.variants).toHaveLength(1);
    // 32,00 € TTC à 5,5 % = 30,331… € HT, en millicentimes.
    expect(body.variants[0]).toMatchObject({ sku: "PAT-7-1", publicTtcCents: 3_200 });
    expect(body.variants[0]?.priceMillicents).toBe(3_033_175);
  });

  /** Régression du plan (C1) : une déclinaison sans déclaration ne se vend jamais. */
  it("range sans allergènes déclarés dans les manques, pas dans les vendables", () => {
    const body = projectProductFact(
      input({ product: tarte({ variants: [bareVariant({ priceCents: 300 })] }) }),
    );

    expect(body.variants).toEqual([]);
    expect(body.gaps).toEqual({ "PAT-7-1": ["allergens"] });
  });

  it("nomme chaque manque : prix, rapport pro, taux de chaque contexte en service", () => {
    const body = projectProductFact(
      input({
        product: tarte({ audience: "both", variants: [bareVariant()] }),
        percents: {},
        rules: { activeContextKeys: ["b2b", "takeaway"], policy: null },
      }),
    );

    expect(body.gaps).toEqual({
      "PAT-7-1": ["price", "allergens", "pro_price_rule", "vat:b2b", "vat:takeaway"],
    });
  });

  /**
   * Le taux `b2b` est exigé même d'une fiche « public » : la plateforme range
   * un article vendable avec son prix pro, qui ne se calcule pas sans lui.
   */
  it("exige le taux b2b d'une fiche vendue au seul public", () => {
    const body = projectProductFact(
      input({ product: tarte({ audience: "public" }), percents: { takeaway: 5.5 } }),
    );

    expect(body.audience).toBe("public");
    expect(body.gaps).toEqual({ "PAT-7-1": ["vat:b2b"] });
  });

  /**
   * 🔴 La règle du lot 2b (Hugo, 2026-10-15) : un taux pour CHAQUE contexte en
   * service, quelle que soit l'audience — changer d'audience ne doit jamais
   * rendre une fiche invendable.
   */
  it("exige le taux de chaque contexte en service, même hors de l'audience", () => {
    const allServed: CompletenessRules = {
      activeContextKeys: ["b2b", "takeaway", "eatIn"],
      policy: POLICY,
    };

    expect(projectProductFact(input({ rules: allServed })).gaps).toEqual({
      "PAT-7-1": ["vat:takeaway", "vat:eatIn"],
    });
    expect(
      projectProductFact(input({ rules: allServed, percents: { ...BOTH_CONTEXTS, eatIn: 10 } }))
        .gaps,
    ).toEqual({});
  });

  it("ne cite pas une déclinaison arrêtée : rien ne lui manque, elle ne se vend plus", () => {
    const stopped = bareVariant({
      id: "v2",
      sku: "PAT-7-2",
      isDefault: false,
      isDiscontinued: true,
    });
    const body = projectProductFact(
      input({ product: tarte({ variants: [SELLABLE_VARIANT, stopped] }) }),
    );

    expect(body.variants.map((variant) => variant.sku)).toEqual(["PAT-7-1"]);
    expect(body.gaps).toEqual({});
  });

  it("dit l'état dans les mots de l'écran", () => {
    expect(projectProductFact(input({ product: tarte({ status: "draft" }) })).status).toBe(
      "inactive",
    );
    expect(projectProductFact(input({ product: tarte({ status: "archived" }) })).status).toBe(
      "archived",
    );
  });

  /** Une fiche inactive porte ses déclinaisons complètes : c'est la plateforme qui ne les vend pas. */
  it("projette les déclinaisons complètes d'une fiche inactive", () => {
    const body = projectProductFact(input({ product: tarte({ status: "draft" }) }));

    expect(body.variants).toHaveLength(1);
  });

  it("porte sa famille, audience et archivage compris", () => {
    const body = projectProductFact(input({ family: family({ isArchived: true }) }));

    expect(body.family).toEqual({
      id: "cat_patisserie",
      name: "Pâtisserie",
      slug: "patisserie",
      parentId: null,
      position: 2,
      vatRatePercent: 5.5,
      audience: "pro",
      archived: true,
    });
  });

  it("hérite l'audience de la famille, ou la dérogation de la fiche", () => {
    expect(projectProductFact(input({ family: family({ audience: "both" }) })).audience).toBe(
      "both",
    );
    expect(
      projectProductFact(
        input({ product: tarte({ audience: "pro" }), family: family({ audience: "both" }) }),
      ).audience,
    ).toBe("pro");
  });
});

describe("projectFamilyFact", () => {
  it("laisse le taux à null quand le contexte b2b n'est pas réglé — jamais inventé", () => {
    expect(projectFamilyFact(family(), { takeaway: 5.5 }).vatRatePercent).toBeNull();
  });
});

/** Lot P (P4) : sous « Prix saisi », la saisie fait le prix, son absence fait un manque. */
describe("projectProductFact — sous la méthode entered", () => {
  const ENTERED: ProPricePolicy = { method: "entered", ratioBp: 10_000 };

  it("range une déclinaison sans prix pro saisi dans les manques, sans lever", () => {
    const body = projectProductFact(input({ rules: { ...B2B_ONLY, policy: ENTERED } }));

    expect(body.variants).toEqual([]);
    expect(body.gaps).toEqual({ "PAT-7-1": ["pro_price"] });
  });

  it("vend au HT saisi, au millicentime", () => {
    const body = projectProductFact(
      input({
        rules: { ...B2B_ONLY, policy: ENTERED },
        product: tarte({
          status: "published",
          variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: 2_712_345 }],
        }),
      }),
    );

    expect(body.gaps).toEqual({});
    expect(body.variants[0]?.priceMillicents).toBe(2_712_345);
  });
});
