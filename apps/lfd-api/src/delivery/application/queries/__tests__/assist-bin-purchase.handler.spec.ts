import type { PurchaseAssistantPayload } from "@lfd/contracts";

import { InvalidCargoDimensionsError } from "../../../domain/errors/delivery-errors.js";
import { InvalidBinMaxStackError } from "../../../domain/errors/delivery-bin-errors.js";
import {
  InvalidBinGapError,
  InvalidWheelArchesError,
} from "../../../domain/errors/delivery-floor-errors.js";
import { AssistBinPurchaseHandler } from "../assist-bin-purchase.handler.js";
import { AssistBinPurchaseQuery } from "../assist-bin-purchase.query.js";

const SCENARIO: PurchaseAssistantPayload = {
  floor: { lengthCm: 100, widthCm: 100, heightCm: 50, wheelArches: null },
  gapCm: 0,
  formats: [
    {
      name: "Grand",
      outer: { lengthMm: 600, widthMm: 400, heightMm: 200 },
      inner: { lengthMm: 500, widthMm: 300, heightMm: 200 },
      maxStack: 5,
    },
    {
      name: "Petit",
      outer: { lengthMm: 500, widthMm: 500, heightMm: 200 },
      inner: { lengthMm: 500, widthMm: 500, heightMm: 200 },
      maxStack: 1,
    },
  ],
};

const run = (scenario: PurchaseAssistantPayload): ReturnType<AssistBinPurchaseHandler["execute"]> =>
  new AssistBinPurchaseHandler().execute(new AssistBinPurchaseQuery(scenario));

describe("AssistBinPurchaseHandler (G-D3)", () => {
  it("rend chaque format dans l'ordre du corps, avec le volume du véhicule", async () => {
    const view = await run(SCENARIO);

    expect(view.vehicleVolumeLiters).toBe(500);
    // Grand : 3 au sol (60 en long + 40 tourné), ⌊50 ÷ 20⌋ = 2 < 5 → plafond, 6 bacs de 30 L.
    expect(view.formats[0]).toMatchObject({
      name: "Grand",
      floorCount: 3,
      levels: 2,
      total: 6,
      usefulLiters: 180,
      vehiclePercent: 36,
      heightLimit: "ceiling",
    });
    // Petit : 2 × 2 au sol, pile 1 → la pile limite ; 4 × 50 L = 200 L, 40 %.
    expect(view.formats[1]).toMatchObject({
      name: "Petit",
      total: 4,
      usefulLiters: 200,
      vehiclePercent: 40,
      heightLimit: "stack",
    });
  });

  it.each([
    [{ ...SCENARIO, gapCm: 11 }, InvalidBinGapError],
    [{ ...SCENARIO, floor: { ...SCENARIO.floor, lengthCm: 1001 } }, InvalidCargoDimensionsError],
    [
      {
        ...SCENARIO,
        floor: {
          ...SCENARIO.floor,
          wheelArches: { lengthCm: 10, protrusionCm: 50, fromBackCm: 0 },
        },
      },
      InvalidWheelArchesError,
    ],
    [
      { ...SCENARIO, formats: [{ ...SCENARIO.formats[1]!, maxStack: 21 }] },
      InvalidBinMaxStackError,
    ],
  ])("refuse par le domaine (%#)", (scenario, error) => {
    expect(() => run(scenario)).toThrow(error);
  });
});
