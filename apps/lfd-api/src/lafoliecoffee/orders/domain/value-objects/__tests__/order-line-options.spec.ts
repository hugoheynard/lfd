import { OrderLine, type OrderLineInput } from "../order-line.js";
import type { OrderLineOptionChoice } from "../order-line-options.js";
import {
  DuplicateOptionChoiceError,
  OptionQuantityAboveLineError,
  OptionQuantityNotPositiveError,
  WeightOptionQuantityError,
} from "../../errors/order-option-errors.js";

const SLICED: OrderLineOptionChoice = {
  group: "og_slicing",
  groupName: "Tranchage",
  choice: "sliced",
  choiceLabel: "tranché",
  quantity: 2,
  position: 0,
};
const WRAPPED: OrderLineOptionChoice = {
  group: "og_wrap",
  groupName: "Emballage",
  choice: "wrapped",
  choiceLabel: "emballé",
  quantity: 4,
  position: 1,
};

const BREAD: OrderLineInput = {
  sku: "PAIN-CAMP",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 4,
  saleUnit: "piece",
};

const RYE_BY_WEIGHT: OrderLineInput = {
  ...BREAD,
  sku: "SEIGLE-KG",
  productName: "Pain de seigle",
  quantity: 1_200,
  saleUnit: "weight",
};

describe("OrderLine — les options (« dont 2 tranchés »)", () => {
  it("garde ses options figées, dans le snapshot", () => {
    const line = OrderLine.create({ ...BREAD, optionChoices: [SLICED] }, "pro");

    expect(line.toSnapshot().optionChoices).toEqual([SLICED]);
  });

  it("une ligne sans option porte [] — jamais undefined", () => {
    expect(OrderLine.create(BREAD, "pro").toSnapshot().optionChoices).toEqual([]);
  });

  it("🔴 les options ne changent AUCUN montant — pro comme particulier", () => {
    for (const clientele of ["pro", "public"] as const) {
      const bare = OrderLine.create(BREAD, clientele).toSnapshot();
      const optioned = OrderLine.create(
        { ...BREAD, optionChoices: [SLICED, WRAPPED] },
        clientele,
      ).toSnapshot();
      const { optionChoices: _bare, ...bareRest } = bare;
      const { optionChoices: _opt, ...optionedRest } = optioned;
      expect(optionedRest).toEqual(bareRest);
    }
  });

  it("compte chaque groupe indépendamment : 2 tranchés et 4 emballés sur 4", () => {
    expect(() =>
      OrderLine.create({ ...BREAD, optionChoices: [SLICED, WRAPPED] }, "pro"),
    ).not.toThrow();
  });

  it("refuse une somme d'un groupe supérieure à la ligne", () => {
    const tooMany = [
      SLICED,
      { ...SLICED, choice: "thin", choiceLabel: "tranché fin", quantity: 3, position: 1 },
    ];
    expect(() => OrderLine.create({ ...BREAD, optionChoices: tooMany }, "pro")).toThrow(
      OptionQuantityAboveLineError,
    );
  });

  it.each([0, -1])("refuse une quantité d'option de %i", (quantity) => {
    expect(() =>
      OrderLine.create({ ...BREAD, optionChoices: [{ ...SLICED, quantity }] }, "pro"),
    ).toThrow(OptionQuantityNotPositiveError);
  });

  it("refuse le même choix cité deux fois", () => {
    const twice = [
      { ...SLICED, quantity: 1 },
      { ...SLICED, quantity: 1 },
    ];
    expect(() => OrderLine.create({ ...BREAD, optionChoices: twice }, "pro")).toThrow(
      DuplicateOptionChoiceError,
    );
  });

  it("au poids, le choix vaut pour toute la ligne", () => {
    const whole = { ...SLICED, quantity: 1_200 };
    expect(
      OrderLine.create({ ...RYE_BY_WEIGHT, optionChoices: [whole] }, "public").toSnapshot()
        .optionChoices,
    ).toEqual([whole]);
  });

  it("au poids, refuse une quantité d'option autre que la ligne", () => {
    expect(() =>
      OrderLine.create({ ...RYE_BY_WEIGHT, optionChoices: [{ ...SLICED, quantity: 600 }] }, "pro"),
    ).toThrow(WeightOptionQuantityError);
  });
});
