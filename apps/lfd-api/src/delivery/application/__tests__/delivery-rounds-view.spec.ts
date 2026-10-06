import { deliveryRoundsDayView, type DeliveryRoundsDayInputs } from "../delivery-rounds-view.js";
import { PlannedTiming } from "../../domain/value-objects/planned-timing.js";

// Des jours comparés entre eux et à un retrait écrit ici — jamais à l'horloge.
const DAY = "2030-03-12";

function inputs(overrides: Partial<DeliveryRoundsDayInputs> = {}): DeliveryRoundsDayInputs {
  return {
    day: DAY,
    rounds: [],
    expected: [],
    composed: new Map(),
    assigned: new Set(),
    drivers: new Set(),
    driverNames: new Map(),
    awaiting: [],
    broughtBack: new Map(),
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
  departedAt: null,
  driverStaffId: null,
  returnedAt: null,
  planned: null,
  stops: [{ stopId: "s_1", orderId: "o_1", position: 1 }],
};

describe("deliveryRoundsDayView", () => {
  it("expose l'horaire prévu en instants ISO, et `null` sans horaire (I10)", () => {
    const planned = PlannedTiming.of({
      departureAt: new Date(3_600_000),
      returnAt: new Date(7_200_000),
      meters: 42_000,
    });
    const view = deliveryRoundsDayView(
      inputs({
        rounds: [
          { ...round, planned },
          { ...round, id: "r_2" },
        ],
      }),
    );
    expect(view.rounds[0]?.planned).toEqual({
      departureAt: new Date(3_600_000).toISOString(),
      returnAt: new Date(7_200_000).toISOString(),
      meters: 42_000,
    });
    expect(view.rounds[1]?.planned).toBeNull();
  });

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
      customerLabel: "Maison A",
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

  it("met EN TÊTE de « à répartir » les commandes rapportées, quel que soit leur jour, datées (RL1)", () => {
    const broughtBackAt = new Date("2030-03-10T15:00:00.000Z");
    const view = deliveryRoundsDayView(
      inputs({
        expected: [
          { orderId: "o_1", reference: "A", status: "active" },
          { orderId: "o_2", reference: "B", status: "active" },
        ],
        awaiting: [
          { orderId: "o_9", reference: "Z", status: "active" },
          { orderId: "o_2", reference: "B", status: "active" },
        ],
        broughtBack: new Map([
          ["o_9", broughtBackAt],
          ["o_2", broughtBackAt],
        ]),
      }),
    );

    expect(view.unassigned).toEqual([
      { orderId: "o_9", reference: "Z", broughtBackAt: broughtBackAt.toISOString() },
      { orderId: "o_2", reference: "B", broughtBackAt: broughtBackAt.toISOString() },
      { orderId: "o_1", reference: "A" },
    ]);
  });

  it("une commande rapportée replacée un autre jour n'est pas « plus de ce jour », et porte sa date (RL1)", () => {
    const broughtBackAt = new Date("2030-03-10T15:00:00.000Z");
    const order = {
      orderId: "o_1",
      reference: "A",
      customerLabel: "Maison A",
      status: "active" as const,
      day: "2030-03-10",
      delivery: true,
    };
    const view = deliveryRoundsDayView(
      inputs({
        rounds: [round],
        composed: new Map([["o_1", order]]),
        broughtBack: new Map([["o_1", broughtBackAt]]),
      }),
    );

    expect(view.rounds[0]?.stops[0]).toMatchObject({
      signals: [],
      orderDay: "2030-03-10",
      broughtBackAt: broughtBackAt.toISOString(),
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

  it("rend le départ d'une tournée partie (lot 4) : l'écran la montre en lecture seule", () => {
    const departedAt = new Date(0);
    const view = deliveryRoundsDayView(
      inputs({ rounds: [round, { ...round, id: "r_2", departedAt }] }),
    );

    expect(view.rounds.map((entry) => entry.departedAt)).toEqual([null, departedAt.toISOString()]);
  });

  it("dit le livreur affecté, nommé par l'annuaire, et s'il a perdu le droit (MT-D2 v2)", () => {
    const view = deliveryRoundsDayView(
      inputs({
        rounds: [
          { ...round, driverStaffId: "staff_paul" },
          { ...round, id: "r_2", driverStaffId: "staff_ancien" },
          { ...round, id: "r_3" },
        ],
        drivers: new Set(["staff_paul"]),
        driverNames: new Map([
          ["staff_paul", "Paul Roux"],
          ["staff_ancien", null],
        ]),
      }),
    );

    expect(view.rounds.map((entry) => entry.driver)).toEqual([
      { staffUserId: "staff_paul", name: "Paul Roux", canDrive: true },
      { staffUserId: "staff_ancien", name: null, canDrive: false },
      null,
    ]);
  });
});
