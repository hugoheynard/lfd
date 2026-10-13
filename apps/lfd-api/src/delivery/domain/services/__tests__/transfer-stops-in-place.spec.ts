import { withTransferStopsInPlace } from "../transfer-stops-in-place.js";

const STOPS = [
  { kind: "order" as const, id: "s_1", orderId: "o_1" },
  { kind: "transfer" as const, id: "s_t", transferId: "t_1" },
  { kind: "order" as const, id: "s_2", orderId: "o_2" },
];

describe("un arrêt de transfert garde sa place (lot T1)", () => {
  it("réinsère à son rang un arrêt de transfert que l'ordre ne cite pas", () => {
    expect(withTransferStopsInPlace(STOPS, ["s_2", "s_1"])).toEqual(["s_2", "s_t", "s_1"]);
  });

  it("laisse tel quel un ordre qui les cite tous", () => {
    expect(withTransferStopsInPlace(STOPS, ["s_t", "s_1", "s_2"])).toEqual(["s_t", "s_1", "s_2"]);
  });
});
