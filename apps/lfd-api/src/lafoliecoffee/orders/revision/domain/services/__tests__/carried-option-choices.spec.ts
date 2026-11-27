import type { OrderLineOptionChoice } from "../../../../domain/value-objects/order-line-options.js";
import { carriedOptionChoices } from "../carried-option-choices.js";

function option(
  group: string,
  choice: string,
  quantity: number,
  position: number,
): OrderLineOptionChoice {
  return { group, groupName: group, choice, choiceLabel: choice, quantity, position };
}

describe("carriedOptionChoices — la quantité baisse, les options suivent", () => {
  const sliced = option("slicing", "sliced", 2, 0);
  const thin = option("slicing", "thin", 1, 1);
  const wrapped = option("wrap", "wrapped", 3, 2);

  it("réduit d'abord le « sans » : 6 pains dont 3 tranchés, baissés à 4, gardent leurs 3", () => {
    expect(carriedOptionChoices({ saleUnit: "piece", optionChoices: [sliced, thin] }, 4)).toEqual([
      sliced,
      thin,
    ]);
  });

  it("puis les options, en commençant par le dernier choix du groupe", () => {
    expect(carriedOptionChoices({ saleUnit: "piece", optionChoices: [sliced, thin] }, 2)).toEqual([
      sliced,
    ]);
    expect(carriedOptionChoices({ saleUnit: "piece", optionChoices: [sliced, thin] }, 1)).toEqual([
      { ...sliced, quantity: 1 },
    ]);
  });

  it("chaque groupe se réduit indépendamment", () => {
    expect(
      carriedOptionChoices({ saleUnit: "piece", optionChoices: [sliced, thin, wrapped] }, 2),
    ).toEqual([sliced, { ...wrapped, quantity: 2 }]);
  });

  it("monter la quantité ne touche pas les options : le surplus est « sans »", () => {
    expect(carriedOptionChoices({ saleUnit: "piece", optionChoices: [sliced] }, 10)).toEqual([
      sliced,
    ]);
  });

  it("au poids, le choix suit toute la ligne", () => {
    expect(
      carriedOptionChoices(
        { saleUnit: "weight", optionChoices: [option("slicing", "sliced", 1200, 0)] },
        800,
      ),
    ).toEqual([option("slicing", "sliced", 800, 0)]);
  });
});
