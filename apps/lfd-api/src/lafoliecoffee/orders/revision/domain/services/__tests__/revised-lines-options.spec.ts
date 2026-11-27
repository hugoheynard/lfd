import type { OrderLineSnapshot } from "../../../../domain/value-objects/order-line.js";
import type { OrderLineOptionChoice } from "../../../../domain/value-objects/order-line-options.js";
import { keptQuantityChanges, revisedLineRequests } from "../revised-lines.js";

/**
 * Les options d'une révision (`plan-options-de-commande.md`, § 3.3) : redites,
 * elles sont à juger ; tues, la ligne garde les siennes, réduites d'abord sur
 * le « sans ». Changer les seules options ne juge aucun prix.
 */
const SLICED: OrderLineOptionChoice = {
  group: "og_slicing",
  groupName: "Tranchage",
  choice: "sliced",
  choiceLabel: "tranché",
  quantity: 2,
  position: 0,
};

function bread(
  quantity: number,
  optionChoices: readonly OrderLineOptionChoice[],
): OrderLineSnapshot {
  return {
    sku: "PAIN",
    productName: "Pain de campagne",
    unitPriceMillicents: 300_000,
    vatRate: 5.5,
    saleUnit: "piece",
    quantity,
    lineTotalCents: 0,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: true,
    productId: null,
    categoryId: null,
    madeToOrder: null,
    optionChoices,
  };
}

describe("revisedLineRequests — les options", () => {
  it("tues, la ligne gardée garde ses options, réduites d'abord sur le « sans »", () => {
    const split = revisedLineRequests([bread(4, [SLICED])], [{ sku: "PAIN", quantity: 3 }]);

    expect(split.frozen.get("PAIN")?.optionChoices).toEqual([SLICED]);
    expect(split.keptOptions.size).toBe(0);
  });

  it("redites, elles partent au jugement du catalogue — fusionnées par SKU", () => {
    const split = revisedLineRequests(
      [bread(4, [SLICED])],
      [
        {
          sku: "PAIN",
          quantity: 2,
          optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 1 }],
        },
        {
          sku: "PAIN",
          quantity: 2,
          optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 2 }],
        },
      ],
    );

    expect(split.keptOptions.get("PAIN")).toEqual([
      { group: "og_slicing", choice: "sliced", quantity: 3 },
    ]);
  });

  it("redites vides, elles retirent toutes les options", () => {
    const split = revisedLineRequests(
      [bread(4, [SLICED])],
      [{ sku: "PAIN", quantity: 4, optionChoices: [] }],
    );

    expect(split.keptOptions.get("PAIN")).toEqual([]);
  });

  it("🔴 changer les seules options ne juge aucun prix : la quantité n'a pas bougé", () => {
    const previous = [bread(4, [SLICED])];
    const split = revisedLineRequests(previous, [
      {
        sku: "PAIN",
        quantity: 4,
        optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 4 }],
      },
    ]);

    expect(keptQuantityChanges(previous, split)).toEqual([]);
  });

  it("une ligne nouvelle emporte ses options vers la tarification du jour", () => {
    const split = revisedLineRequests(
      [],
      [
        {
          sku: "PAIN",
          quantity: 4,
          optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 2 }],
        },
      ],
    );

    expect(split.fresh).toEqual([
      {
        sku: "PAIN",
        quantity: 4,
        saleUnit: "piece",
        optionChoices: [{ group: "og_slicing", choice: "sliced", quantity: 2 }],
      },
    ]);
  });
});
