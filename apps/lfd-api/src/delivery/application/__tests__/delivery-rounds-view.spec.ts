import { deliveryRoundsDayView, type DeliveryRoundsDayInputs } from "../delivery-rounds-view.js";

// Des jours comparés entre eux et à un retrait écrit ici — jamais à l'horloge.
const DAY = "2030-03-12";

function inputs(overrides: Partial<DeliveryRoundsDayInputs> = {}): DeliveryRoundsDayInputs {
  return {
    day: DAY,
    rounds: [],
    expected: [],
    composed: new Map(),
    assigned: new Set(),
    ...overrides,
  };
}

const round = {
  id: "r_1",
  vehicleId: "v_1",
  vehicleName: "Kangoo",
  passage: 1,
  version: 3,
  vehicleRetiredAt: null,
  stops: [{ stopId: "s_1", orderId: "o_1", position: 1 }],
};

describe("deliveryRoundsDayView", () => {
  it("« à répartir » exclut les annulées et les commandes composées, même ailleurs", () => {
    const view = deliveryRoundsDayView(
      inputs({
        expected: [
          { orderId: "o_1", reference: "A", status: "active" },
          { orderId: "o_2", reference: "B", status: "cancelled" },
          { orderId: "o_3", reference: "C", status: "active" },
        ],
        assigned: new Set(["o_1"]),
      }),
    );

    expect(view.unassigned).toEqual([{ orderId: "o_3", reference: "C" }]);
  });

  it.each([
    ["annulée", { status: "cancelled" as const }, ["cancelled"]],
    ["plus de ce jour", { day: "2030-03-14" }, ["not_this_day"]],
    ["passée en retrait", { delivery: false }, ["not_delivery"]],
    ["en ordre", {}, []],
  ])("signale une commande %s", (_label, change, signals) => {
    const order = {
      orderId: "o_1",
      reference: "A",
      status: "active" as const,
      day: DAY,
      delivery: true,
      ...change,
    };
    const view = deliveryRoundsDayView(
      inputs({ rounds: [round], composed: new Map([["o_1", order]]) }),
    );

    expect(view.rounds[0]?.stops[0]).toEqual({
      stopId: "s_1",
      orderId: "o_1",
      reference: "A",
      position: 1,
      signals,
      orderDay: order.day,
    });
  });

  it("dit qu'une tournée roule sur un véhicule retiré avant ce jour (C14)", () => {
    const view = deliveryRoundsDayView(
      inputs({
        rounds: [
          { ...round, vehicleRetiredAt: new Date("2030-03-10T10:00:00.000Z") },
          { ...round, id: "r_2", vehicleRetiredAt: new Date("2030-03-12T10:00:00.000Z") },
        ],
      }),
    );

    expect(view.rounds.map((entry) => entry.vehicleRetired)).toEqual([true, false]);
  });
});
