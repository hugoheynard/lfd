import {
  bareVariant,
  tarte,
} from "../../../../catalogue/product/shared/__tests__/audience-doubles.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import type { OptionGroupOffer } from "../../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import { CatalogProductChangedFact } from "../catalog-product-changed.fact.js";
import { variantOptionsOf } from "../variant-options.js";

/**
 * Les groupes d'options de chaque déclinaison, tels que le fait v19 les porte
 * (`plan-options-de-commande.md`, § 3.2) : actifs, en service, avec un choix
 * en service ; au poids comme à la pièce.
 */

const TRANCHAGE: OptionGroupOffer = {
  id: "grp_tranchage",
  name: "Tranchage",
  archived: false,
  choices: [
    { key: "tranche", label: "Tranché", audience: "both" },
    { key: "tranche-fin", label: "Tranché fin", audience: "pro" },
  ],
};
const EMBALLAGE: OptionGroupOffer = {
  id: "grp_emballage",
  name: "Emballage",
  archived: false,
  choices: [{ key: "emballe", label: "Emballé", audience: "public" }],
};

const PAIN: ProductRecord = tarte({
  id: "prd_pain",
  variants: [
    bareVariant({ id: "var_piece" }),
    bareVariant({ id: "var_poids", saleUnit: "weight", isDefault: false, position: 1 }),
  ],
});

describe("variantOptionsOf", () => {
  it("porte un groupe actif pour toutes sur chaque déclinaison, au poids compris", () => {
    const options = variantOptionsOf(
      [PAIN],
      new Map([["prd_pain", [{ groupId: TRANCHAGE.id, variantIds: null }]]]),
      [TRANCHAGE],
    );
    const wire = { id: TRANCHAGE.id, name: "Tranchage", choices: TRANCHAGE.choices };
    expect(options.get("var_piece")).toEqual([wire]);
    expect(options.get("var_poids")).toEqual([wire]);
  });

  it("ne porte un groupe à liste que sur les déclinaisons nommées, dans l'ordre d'activation", () => {
    const options = variantOptionsOf(
      [PAIN],
      new Map([
        [
          "prd_pain",
          [
            { groupId: EMBALLAGE.id, variantIds: ["var_poids"] },
            { groupId: TRANCHAGE.id, variantIds: null },
          ],
        ],
      ]),
      [TRANCHAGE, EMBALLAGE],
    );
    expect(options.get("var_piece")?.map((group) => group.id)).toEqual([TRANCHAGE.id]);
    expect(options.get("var_poids")?.map((group) => group.id)).toEqual([
      EMBALLAGE.id,
      TRANCHAGE.id,
    ]);
  });

  it("écarte un groupe archivé, sans choix en service, ou inconnu", () => {
    const options = variantOptionsOf(
      [PAIN],
      new Map([
        [
          "prd_pain",
          [
            { groupId: TRANCHAGE.id, variantIds: null },
            { groupId: EMBALLAGE.id, variantIds: null },
            { groupId: "grp_absent", variantIds: null },
          ],
        ],
      ]),
      [
        { ...TRANCHAGE, archived: true },
        { ...EMBALLAGE, choices: [] },
      ],
    );
    expect(options.size).toBe(0);
  });
});

describe("CatalogProductChangedFact — fil v19", () => {
  /** Un fait v18 en vol ne porte pas `optionGroups` : il se lit sans option. */
  it("lit un fait d'avant la v19 avec une liste vide de groupes", () => {
    const emitted = new CatalogProductChangedFact("prd_pain", 3, "2026-11-19T09:00:00.000Z", {
      status: "active",
      audience: "both",
      audienceInherited: true,
      product: {
        id: "prd_pain",
        sku: "PAI-1",
        name: "Pain",
        categoryId: "cat_pain",
        kind: "daily",
        note: null,
        noteTranslations: null,
        description: null,
        descriptionTranslations: null,
        image: null,
        thumbnail: null,
        operationOnly: false,
        requiresCold: false,
        variantsAsTiles: true,
        detachedFromSku: null,
      },
      variants: [],
      gaps: {},
      family: {
        id: "cat_pain",
        name: "Pains",
        nameTranslations: null,
        slug: "pains",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
        audience: "both",
        archived: false,
      },
    }).durableFact().payload;
    const v18Variant = {
      id: "var_piece",
      sku: "PAI-1-1",
      name: "Pain",
      priceMillicents: 100_000,
      weightGrams: 500,
      isDefault: true,
      position: 0,
      vatRatePercent: 5.5,
      publicTtcCents: 300,
      publicByContext: {},
      allergens: [],
      allergenLabels: null,
      nameTranslations: null,
      customRecipe: false,
    };

    const read = CatalogProductChangedFact.fromPayload({ ...emitted, variants: [v18Variant] });

    expect(read.body.variants[0]?.optionGroups).toEqual([]);
  });
});
