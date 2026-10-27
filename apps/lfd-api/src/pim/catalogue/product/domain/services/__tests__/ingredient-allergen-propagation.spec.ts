import type { VariantSnapshot } from "../../entities/variant.js";
import {
  effectiveChange,
  ownDeclarations,
  propagatedSheet,
  propagationCounts,
  variantPropagation,
  type ProductPropagation,
} from "../ingredient-allergen-propagation.js";

function variant(declared: readonly string[] | null, over: Partial<VariantSnapshot> = {}) {
  return {
    id: "v1",
    sku: "PAT-1-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: declared === null ? null : { declared, mayContain: ["NUT"] },
    nutrition: null,
    ...over,
  } satisfies VariantSnapshot;
}

describe("effectiveChange", () => {
  it("ne propage que ce que l'ingrédient dit encore", () => {
    expect(effectiveChange({ added: ["GB", "UW", "GB"], removed: ["SH", "GB"] }, ["GB"])).toEqual({
      added: ["GB"],
      removed: ["SH"],
    });
  });
});

describe("variantPropagation — ajout", () => {
  const ADD_GB = { added: ["GB"], removed: [] };

  it("ajoute à une liste qui ne le porte pas", () => {
    expect(variantPropagation(variant(["UW"]), ADD_GB, []).toAdd).toEqual(["GB"]);
  });

  it("ajoute à « aucun allergène »", () => {
    expect(variantPropagation(variant([]), ADD_GB, []).toAdd).toEqual(["GB"]);
  });

  it("ne fait rien quand la déclaration le porte déjà", () => {
    expect(variantPropagation(variant(["GB"]), ADD_GB, []).toAdd).toEqual([]);
  });

  // D5 : on ne fabrique pas une déclaration que personne n'a faite.
  it("ne propose rien à une déclinaison non renseignée, et la signale", () => {
    const result = variantPropagation(variant(null), ADD_GB, []);

    expect(result).toMatchObject({ toAdd: [], toRemove: [], undeclared: true });
  });
});

describe("variantPropagation — retrait", () => {
  const REMOVE_UW = { added: [], removed: ["UW"] };

  it("propose le retrait d'un code déclaré qu'aucun autre ingrédient ne porte", () => {
    expect(variantPropagation(variant(["UW", "GB"]), REMOVE_UW, ["GB"])).toMatchObject({
      toRemove: ["UW"],
      keptByOtherIngredient: [],
    });
  });

  it("garde un code qu'un autre ingrédient porte encore", () => {
    expect(variantPropagation(variant(["UW"]), REMOVE_UW, ["UW"])).toMatchObject({
      toRemove: [],
      keptByOtherIngredient: ["UW"],
    });
  });

  it("ne propose rien sur une déclaration qui ne le porte pas", () => {
    expect(variantPropagation(variant(["GB"]), REMOVE_UW, []).toRemove).toEqual([]);
  });
});

describe("variantPropagation — trace, archivé, « aucun »", () => {
  // Décision 3 (2026-10-27) : si l'ingrédient le contient, ce n'est plus une trace.
  it("promeut un code déclaré en trace", () => {
    const result = variantPropagation(variant(["UW"]), { added: ["NUT"], removed: [] }, []);

    expect(result).toMatchObject({ toAdd: ["NUT"], promotedFromTrace: ["NUT"], blocked: [] });
  });

  // Décision 4 : un code archivé exclut la déclinaison pour ce code, sans échec global.
  it("bloque un code archivé qu'elle ne portait pas, avec sa raison", () => {
    const result = variantPropagation(
      variant([]),
      { added: ["OLD", "GB"], removed: [] },
      [],
      new Set(["OLD"]),
    );

    expect(result.toAdd).toEqual(["GB"]);
    expect(result.blocked).toEqual([{ code: "OLD", reason: "archived_allergen" }]);
  });

  // Décision 5 : le retrait qui vide la liste se dit.
  it("signale qu'un retrait vide la liste", () => {
    const result = variantPropagation(variant(["UW"]), { added: [], removed: ["UW"] }, []);

    expect(result.becomesNone).toBe(true);
  });

  it("ne le signale pas quand un autre code reste déclaré", () => {
    const result = variantPropagation(variant(["UW", "GB"]), { added: [], removed: ["UW"] }, []);

    expect(result.becomesNone).toBe(false);
  });
});

describe("propagatedSheet", () => {
  const sheet = { declared: ["UW"], mayContain: ["NUT", "SH"] };
  const planned = variantPropagation(
    variant(["UW"], { allergenSheet: sheet }),
    { added: ["GB", "NUT"], removed: ["UW"] },
    [],
  );

  it("ajoute, promeut hors des traces, et retire", () => {
    expect(propagatedSheet(sheet, planned, false)).toEqual({
      allergens: ["GB", "NUT"],
      mayContain: ["SH"],
    });
  });

  it("garde le retrait décoché", () => {
    expect(propagatedSheet(sheet, planned, true).allergens).toEqual(["UW", "GB", "NUT"]);
  });
});

describe("ownDeclarations", () => {
  it("écarte une déclinaison alignée sur le défaut", () => {
    const aligned = variant(["UW"], { id: "v2", isDefault: false, regulatoryFollowsDefault: true });

    expect(ownDeclarations([aligned, variant(["UW"])]).map((v) => v.id)).toEqual(["v1"]);
  });
});

describe("propagationCounts — une partition des fiches touchées", () => {
  const base = {
    variantId: "v",
    sku: "S",
    toAdd: [],
    toRemove: [],
    promotedFromTrace: [],
    becomesNone: false,
    blocked: [],
    undeclared: false,
    keptByOtherIngredient: [],
  };
  function product(
    id: string,
    status: "draft" | "published",
    ...variants: ProductPropagation["variants"]
  ): ProductPropagation {
    return { productId: id, name: id, status, variants };
  }
  function partitionSum(counts: ReturnType<typeof propagationCounts>): number {
    return (
      counts.toLose +
      counts.toReceive +
      counts.blocked +
      counts.undeclared +
      counts.alreadyDeclared +
      counts.keptByOtherIngredient
    );
  }

  it("range chaque fiche une fois, par priorité, et la somme fait les fiches touchées", () => {
    const counts = propagationCounts(
      [
        product("lose", "published", { ...base, toRemove: ["UW"] }, { ...base, toAdd: ["GB"] }),
        product("receive", "published", { ...base, toAdd: ["GB"] }, { ...base, undeclared: true }),
        product("receive2", "draft", { ...base, toAdd: ["GB"] }),
        product("empty", "draft", { ...base, undeclared: true }),
        product("done", "draft", base),
      ],
      { added: ["GB"], removed: ["UW"] },
    );

    expect(counts).toEqual({
      productsTouched: 5,
      toLose: 1,
      toLosePublished: 1,
      toReceive: 2,
      toReceivePublished: 1,
      blocked: 0,
      undeclared: 1,
      alreadyDeclared: 1,
      keptByOtherIngredient: 0,
    });
    expect(partitionSum(counts)).toBe(counts.productsTouched);
  });

  it("range en « bloquée », pas en « déjà conforme », une fiche dont le seul changement est refusé", () => {
    const counts = propagationCounts(
      [
        product("blocked", "draft", {
          ...base,
          blocked: [{ code: "OLD", reason: "archived_allergen" }],
        }),
      ],
      { added: ["OLD"], removed: [] },
    );

    expect(counts).toMatchObject({ blocked: 1, alreadyDeclared: 0 });
    expect(partitionSum(counts)).toBe(counts.productsTouched);
  });

  it("compte « gardée par un autre ingrédient » sur un retrait seul", () => {
    const counts = propagationCounts(
      [
        product("kept", "draft", { ...base, keptByOtherIngredient: ["UW"] }),
        product("nothing", "draft", base),
      ],
      { added: [], removed: ["UW"] },
    );

    expect(counts).toMatchObject({ keptByOtherIngredient: 1, alreadyDeclared: 1 });
    expect(partitionSum(counts)).toBe(counts.productsTouched);
  });
});
