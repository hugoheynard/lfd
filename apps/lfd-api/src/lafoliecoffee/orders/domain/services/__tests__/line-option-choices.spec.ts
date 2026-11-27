import type { OfferedOptionGroup } from "../../../../catalog/domain/option-groups/catalog-option-groups.js";
import {
  OptionChoiceNotOfferedError,
  OptionGroupNotOfferedError,
  OptionQuantityAboveLineError,
  OptionQuantityNotPositiveError,
  WeightOptionQuantityError,
} from "../../errors/order-option-errors.js";
import { freezeOptionChoices, mergeRequestedOptions } from "../line-option-choices.js";

const SLICING: OfferedOptionGroup = {
  id: "og_slicing",
  name: "Tranchage",
  choices: [
    { key: "sliced", label: "tranché" },
    { key: "thin", label: "tranché fin" },
  ],
};
const WRAP: OfferedOptionGroup = {
  id: "og_wrap",
  name: "Emballage",
  choices: [{ key: "wrapped", label: "emballé" }],
};
const BREAD = {
  sku: "PAIN",
  productName: "Pain de campagne",
  saleUnit: "piece",
  quantity: 4,
} as const;

describe("mergeRequestedOptions — fusion par SKU, comme les quantités", () => {
  it("additionne le même choix de deux lignes du même SKU", () => {
    const merged = mergeRequestedOptions([
      {
        sku: "PAIN",
        quantity: 2,
        saleUnit: "piece",
        optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 1 }],
      },
      {
        sku: "PAIN",
        quantity: 2,
        saleUnit: "piece",
        optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 1 }],
      },
      { sku: "VIE", quantity: 2, saleUnit: "piece" },
    ]);

    expect(merged.get("PAIN")).toEqual([{ group: "og_slicing", choice: "sliced", quantity: 2 }]);
    expect(merged.has("VIE")).toBe(false);
  });

  it.each([0, -3])("refuse une quantité demandée de %i", (quantity) => {
    expect(() =>
      mergeRequestedOptions([
        {
          sku: "PAIN",
          quantity: 2,
          saleUnit: "piece",
          optionChoices: [{ group: "g", choice: "c", quantity }],
        },
      ]),
    ).toThrow(OptionQuantityNotPositiveError);
  });

  it("au poids, refuse une quantité autre que celle de la ligne demandée", () => {
    expect(() =>
      mergeRequestedOptions([
        {
          sku: "SEIGLE",
          quantity: 1200,
          saleUnit: "weight",
          optionChoices: [{ group: "g", choice: "c", quantity: 1 }],
        },
      ]),
    ).toThrow(WeightOptionQuantityError);
  });
});

describe("freezeOptionChoices — contre ce que le catalogue propose au client", () => {
  it("fige les libellés et l'ordre du référentiel", () => {
    const frozen = freezeOptionChoices(
      BREAD,
      [
        { group: "og_wrap", choice: "wrapped", quantity: 4 },
        { group: "og_slicing", choice: "thin", quantity: 2 },
      ],
      [SLICING, WRAP],
    );

    expect(frozen).toEqual([
      {
        group: "og_slicing",
        groupName: "Tranchage",
        choice: "thin",
        choiceLabel: "tranché fin",
        quantity: 2,
        position: 0,
      },
      {
        group: "og_wrap",
        groupName: "Emballage",
        choice: "wrapped",
        choiceLabel: "emballé",
        quantity: 4,
        position: 1,
      },
    ]);
  });

  it("refuse un groupe que l'article ne propose pas", () => {
    expect(() =>
      freezeOptionChoices(BREAD, [{ group: "og_other", choice: "x", quantity: 1 }], [SLICING]),
    ).toThrow(OptionGroupNotOfferedError);
  });

  it("🔴 refuse un choix hors de la clientèle du client (absent de ce qui lui est proposé)", () => {
    expect(() =>
      freezeOptionChoices(
        BREAD,
        [{ group: "og_slicing", choice: "pro_only", quantity: 1 }],
        [SLICING],
      ),
    ).toThrow(OptionChoiceNotOfferedError);
  });

  it("refuse une somme d'un groupe supérieure à la ligne", () => {
    expect(() =>
      freezeOptionChoices(
        BREAD,
        [
          { group: "og_slicing", choice: "sliced", quantity: 3 },
          { group: "og_slicing", choice: "thin", quantity: 2 },
        ],
        [SLICING],
      ),
    ).toThrow(OptionQuantityAboveLineError);
  });

  it("au poids, le choix vaut pour toute la ligne fusionnée", () => {
    const frozen = freezeOptionChoices(
      { sku: "SEIGLE", productName: "Seigle", saleUnit: "weight", quantity: 2000 },
      [{ group: "og_slicing", choice: "sliced", quantity: 1200 }],
      [SLICING],
    );

    expect(frozen.map((option) => option.quantity)).toEqual([2000]);
  });

  it("un choix déjà figé reste admis sous ses libellés d'alors, même retiré du catalogue", () => {
    const kept = {
      group: "og_old",
      groupName: "Ancien tranchage",
      choice: "sliced",
      choiceLabel: "tranché (ancien)",
      quantity: 1,
      position: 0,
    };
    const frozen = freezeOptionChoices(
      BREAD,
      [{ group: "og_old", choice: "sliced", quantity: 3 }],
      [SLICING],
      [kept],
    );

    expect(frozen).toEqual([{ ...kept, quantity: 3, position: 0 }]);
  });
});
