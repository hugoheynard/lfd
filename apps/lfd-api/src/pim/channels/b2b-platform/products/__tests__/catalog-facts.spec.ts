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

/** Le seul contexte b2b en service : la fiche par défaut est complète. */
const B2B_ONLY: CompletenessRules = { activeContextKeys: ["b2b"] };
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
    cited: [],
    ...over,
  };
}

describe("projectProductFact", () => {
  it("vend une déclinaison complète, au prix pro hors taxe saisi", () => {
    const body = projectProductFact(input());

    expect(body.status).toBe("active");
    expect(body.audience).toBe("pro");
    expect(body.gaps).toEqual({});
    expect(body.variants).toHaveLength(1);
    expect(body.variants[0]).toMatchObject({ sku: "PAT-7-1", publicTtcCents: 3_200 });
    // Le HT saisi, au millicentime — seule source depuis le lot R3.
    expect(body.variants[0]?.priceMillicents).toBe(2_730_331);
  });

  /**
   * Retourné le 2026-10-27 (`plan-allergenes-jamais-bloquants.md`, règle B) :
   * une déclinaison sans déclaration se vend par précaution. Ses allergènes
   * partent à `null` — le fil ne porte pas encore de traces, et la liste des
   * seuls cités se lirait « aucun allergène » quand la composition est muette.
   */
  it("vend une déclinaison sans déclaration, ses allergènes à null", () => {
    const body = projectProductFact(
      input({
        product: tarte({
          variants: [bareVariant({ priceCents: 300, proPriceMillicents: 256_000 })],
        }),
        cited: ["gluten"],
      }),
    );

    expect(body.gaps).toEqual({});
    expect(body.variants[0]).toMatchObject({ allergens: null, allergenLabels: null });
  });

  it("sert ce que la composition cite en plus de la déclaration (règle A)", () => {
    const body = projectProductFact(input({ cited: ["eggs", "gluten"] }));

    expect(body.variants[0]?.allergens).toEqual(["gluten", "eggs"]);
  });

  /** Régression : le pain sans blé refusé le matin du 2026-10-27. */
  it("le pain sans blé qui déclarait aucun allergène et citait le gluten se publie avec le gluten déclaré", () => {
    const body = projectProductFact(
      input({
        product: tarte({
          status: "published",
          variants: [{ ...SELLABLE_VARIANT, allergenSheet: { declared: [], mayContain: [] } }],
        }),
        cited: ["gluten"],
      }),
    );

    expect(body.variants[0]?.allergens).toEqual(["gluten"]);
  });

  it("nomme chaque manque : prix, prix pro, taux de chaque contexte en service", () => {
    const body = projectProductFact(
      input({
        product: tarte({ audience: "both", variants: [bareVariant()] }),
        percents: {},
        rules: { activeContextKeys: ["b2b", "takeaway"] },
      }),
    );

    expect(body.gaps).toEqual({
      "PAT-7-1": ["price", "pro_price", "vat:b2b", "vat:takeaway"],
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
    const allServed: CompletenessRules = { activeContextKeys: ["b2b", "takeaway", "eatIn"] };

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
      // Lot des langues : rien de traduit, on le sait — `{}`, pas `null`.
      nameTranslations: {},
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

  /** Lot 3 : la plateforme dit « hérité » ou « propre à la fiche », même à valeur égale. */
  it("dit si l'audience est héritée — une dérogation identique à la famille n'en est pas une", () => {
    const inherited = projectProductFact(
      input({ product: tarte({ audience: null }), family: family({ audience: "both" }) }),
    );
    const own = projectProductFact(
      input({ product: tarte({ audience: "both" }), family: family({ audience: "both" }) }),
    );
    expect(inherited.audienceInherited).toBe(true);
    expect(own.audienceInherited).toBe(false);
  });
});

/** Lot des langues (2026-10-18) : les traductions descendent, le français reste à sa place. */
describe("projectProductFact — les langues", () => {
  it("porte les traductions du nom de chaque déclinaison vendue", () => {
    const variant = bareVariant({
      ...SELLABLE_VARIANT,
      name: { fr: "Tarte au citron", en: "Lemon tart", it: "Crostata al limone" },
    });
    const body = projectProductFact(input({ product: tarte({ variants: [variant] }) }));

    expect(body.variants[0]).toMatchObject({
      name: "Tarte au citron",
      nameTranslations: { en: "Lemon tart", it: "Crostata al limone" },
    });
  });

  it("porte la ligne traduite reçue de la vitrine, et un objet vide sans vitrine", () => {
    const shown = projectProductFact(
      input({
        showcase: {
          note: "Acidulée",
          noteTranslations: { en: "Tangy" },
          image: null,
          thumbnail: null,
        },
      }),
    );
    const bare = projectProductFact(input());

    expect(shown.product).toMatchObject({ note: "Acidulée", noteTranslations: { en: "Tangy" } });
    expect(bare.product).toMatchObject({ note: null, noteTranslations: {} });
  });

  it("porte le nom traduit de la famille, sans le français", () => {
    const fact = projectFamilyFact(family({ name: { fr: "Pâtisserie", en: "Pastry" } }), PRO_ONLY);

    expect(fact).toMatchObject({ name: "Pâtisserie", nameTranslations: { en: "Pastry" } });
  });
});

describe("projectFamilyFact", () => {
  it("laisse le taux à null quand le contexte b2b n'est pas réglé — jamais inventé", () => {
    expect(projectFamilyFact(family(), { takeaway: 5.5 }).vatRatePercent).toBeNull();
  });
});

/** Le prix pro HT saisi est sa seule source (lot R3, 2026-10-27). */
describe("projectProductFact — le prix pro saisi", () => {
  /**
   * Régression (lot R3) : sans saisie, la déclinaison retombait sur le
   * rapport sous `ratio_ttc` ; elle range désormais un manque, sans lever.
   */
  it("range une déclinaison sans prix pro saisi dans les manques, jamais « rapport pro »", () => {
    const body = projectProductFact(
      input({
        product: tarte({
          status: "published",
          variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }],
        }),
      }),
    );

    expect(body.variants).toEqual([]);
    expect(body.gaps).toEqual({ "PAT-7-1": ["pro_price"] });
  });

  it("vend au HT saisi, au millicentime", () => {
    const body = projectProductFact(
      input({
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
