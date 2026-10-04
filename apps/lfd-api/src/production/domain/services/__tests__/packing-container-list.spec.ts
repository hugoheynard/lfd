import type { PackingSheet } from "@lfd/contracts";

import type { StationDay } from "../../../channels/packing/packing-station.js";
import { withContainerList } from "../packing-container-list.js";

function sheetOf(orderId: string, packed: boolean): PackingSheet {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    containers: 0,
    customerLabel: "Maison",
    fulfillmentMethod: "delivery",
    destination: "",
    lines: [
      {
        sku: "CRO",
        productName: "Croissant",
        quantity: 20,
        packed,
        initials: null,
        packedAt: null,
        awaitingProduction: false,
      },
    ],
    lineCount: 1,
    packedLines: packed ? 1 : 0,
    remainingLines: packed ? 0 : 1,
    pieces: 20,
    packedPieces: packed ? 20 : 0,
    canDeclareReady: packed,
    packedAt: null,
    packedBy: null,
    packedByName: null,
  };
}

const STATION: StationDay = {
  stocks: [],
  orders: [
    {
      orderId: "listed",
      packed: null,
      containers: 2,
      lines: [],
      containerMode: "listed",
      containerList: [
        {
          id: "c_1",
          nature: "bin",
          label: "ABC234",
          bin: { binId: "b_1", code: "ABC234", half: "left" },
          lines: [{ sku: "CRO", quantity: 10 }],
        },
        {
          id: "c_2",
          nature: "bag",
          label: "Sac 1",
          bin: null,
          lines: [{ sku: "CRO", quantity: 4 }],
        },
      ],
    },
  ],
};

describe("withContainerList — la colonne Contenants posée sur le poste (K2b)", () => {
  it("sert les contenants d'une commande `listed`, et ce qui reste à répartir par ligne", () => {
    const [sheet] = withContainerList([sheetOf("listed", false)], STATION);

    expect(sheet?.containerMode).toBe("listed");
    expect(sheet?.containerList).toEqual([
      {
        id: "c_1",
        nature: "bin",
        label: "ABC234",
        binId: "b_1",
        binCode: "ABC234",
        binHalf: "left",
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 10 }],
        pieces: 10,
      },
      expect.objectContaining({ id: "c_2", nature: "bag", binId: null, pieces: 4 }),
    ]);
    expect(sheet?.lines[0]).toMatchObject({ allocated: 14, unallocated: 6 });
  });

  it("une commande `counted`, ou une journée `legacy`, se lit sans contenants", () => {
    const [counted] = withContainerList([sheetOf("other", true)], STATION);
    const [legacy] = withContainerList([sheetOf("listed", false)], null);

    expect(counted).toMatchObject({ containerMode: "counted", containerList: [] });
    expect(counted?.lines[0]).toMatchObject({ allocated: 20, unallocated: 0 });
    expect(legacy?.containerMode).toBe("counted");
  });
});
