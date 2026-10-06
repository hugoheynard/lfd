import { DeliveryRound, type DeliveryRoundState } from "../delivery-round.js";
import { Vehicle } from "../vehicle.js";
import {
  DeliveryRoundCorruptedError,
  DeliveryRoundStaleError,
  DeliveryStopClosedError,
  DeliveryStopNotFoundError,
  InvalidPassageError,
  InvalidServiceDayError,
  InvalidStopOrderError,
  InvalidStopPositionError,
  OrderAlreadyInRoundError,
  VehicleInactiveOnDayError,
} from "../../errors/delivery-round-errors.js";

// Des jours de service comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);

function kangoo(): Vehicle {
  return Vehicle.register({ id: "v_1", name: "Kangoo blanc", plate: "AB-123-CD", at: AT });
}

function loaded(
  stops: DeliveryRoundState["stops"] = [
    { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
    { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
    { id: "s_3", orderId: "o_3", position: 3, closedAt: null },
  ],
): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 4,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops,
  });
}

describe("DeliveryRound.open", () => {
  it("ouvre une tournée vide, version 1, nom du véhicule recopié", () => {
    const round = DeliveryRound.open({
      id: "r_1",
      serviceDay: DAY,
      vehicle: kangoo(),
      passage: 2,
      at: AT,
    });

    expect(round.toSnapshot()).toMatchObject({
      vehicleName: "Kangoo blanc",
      passage: 2,
      version: 1,
      stops: [],
    });
    expect(round.loadedVersion).toBeNull();
  });

  it("refuse un véhicule retiré avant ce jour (C14)", () => {
    const vehicle = kangoo();
    vehicle.retire(new Date("2030-03-10T10:00:00.000Z"));

    expect(() =>
      DeliveryRound.open({ id: "r_1", serviceDay: DAY, vehicle, passage: 1, at: AT }),
    ).toThrow(VehicleInactiveOnDayError);
  });

  it("accepte un véhicule retiré CE jour-là : sa tournée du jour vit", () => {
    const vehicle = kangoo();
    vehicle.retire(new Date("2030-03-12T21:00:00.000Z"));

    expect(() =>
      DeliveryRound.open({ id: "r_1", serviceDay: DAY, vehicle, passage: 1, at: AT }),
    ).not.toThrow();
  });

  it("refuse un passage qui n'est pas 1, 2, 3…", () => {
    for (const passage of [0, -1, 1.5]) {
      expect(() =>
        DeliveryRound.open({ id: "r", serviceDay: DAY, vehicle: kangoo(), passage, at: AT }),
      ).toThrow(InvalidPassageError);
    }
  });

  it("refuse un jour qui n'existe pas au calendrier", () => {
    expect(() =>
      DeliveryRound.open({
        id: "r",
        serviceDay: "2030-02-30",
        vehicle: kangoo(),
        passage: 1,
        at: AT,
      }),
    ).toThrow(InvalidServiceDayError);
  });
});

describe("DeliveryRound.restore", () => {
  it("revérifie I2 : des positions à trou sont un défaut, pas un état", () => {
    expect(() =>
      loaded([
        { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
        { id: "s_2", orderId: "o_2", position: 3, closedAt: null },
      ]),
    ).toThrow(DeliveryRoundCorruptedError);
  });

  it("ne compte pas un arrêt clos dans les positions vivantes, et le réécrit tel quel", () => {
    const round = loaded([
      { id: "s_0", orderId: "o_0", position: 1, closedAt: AT },
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
    ]);

    expect(round.orderIds).toEqual(["o_1"]);
    expect(round.toSnapshot().stops).toContainEqual({
      id: "s_0",
      orderId: "o_0",
      position: 1,
      closedAt: AT,
    });
  });
});

describe("la version", () => {
  it("refuse une version présentée qui n'est pas celle lue", () => {
    expect(() => loaded().ensureVersion(3)).toThrow(DeliveryRoundStaleError);
    expect(() => loaded().ensureVersion(4)).not.toThrow();
  });

  it("avance d'UNE unité par écriture, quel que soit le nombre de gestes", () => {
    const round = loaded();
    round.remove("s_1", LATER);
    round.assign("s_9", "o_9", LATER);

    expect(round.toSnapshot()).toMatchObject({ version: 5, updatedAt: LATER });
    expect(round.loadedVersion).toBe(4);
  });
});

describe("assign / remove", () => {
  it("ajoute en dernier", () => {
    const round = loaded();
    round.assign("s_4", "o_4", LATER);

    expect(round.orderIds).toEqual(["o_1", "o_2", "o_3", "o_4"]);
    expect(round.positionOf("s_4")).toBe(4);
  });

  it("à un rang donné (CA7) : après les N premiers arrêts, la version avance une fois", () => {
    const round = loaded();
    round.assign("s_4", "o_4", LATER, 1);

    expect(round.orderIds).toEqual(["o_1", "o_4", "o_2", "o_3"]);
    expect(round.positionOf("s_4")).toBe(2);
    expect(round.toSnapshot().version).toBe(5);
  });

  it("en tête (0) et en dernier (le nombre d'arrêts) sont des rangs", () => {
    const first = loaded();
    first.assign("s_4", "o_4", LATER, 0);
    const last = loaded();
    last.assign("s_4", "o_4", LATER, 3);

    expect(first.orderIds[0]).toBe("o_4");
    expect(last.orderIds[3]).toBe("o_4");
  });

  it("refuse un rang que la tournée n'a pas, sans rien changer", () => {
    const round = loaded();

    expect(() => round.assign("s_4", "o_4", LATER, 4)).toThrow(InvalidStopPositionError);
    expect(() => round.assign("s_4", "o_4", LATER, -1)).toThrow(InvalidStopPositionError);
    expect(round.orderIds).toEqual(["o_1", "o_2", "o_3"]);
  });

  it("refuse une commande déjà dans la tournée", () => {
    expect(() => loaded().assign("s_4", "o_2", LATER)).toThrow(OrderAlreadyInRoundError);
  });

  it("retire en resserrant les positions ; la ligne retirée garde la sienne", () => {
    const round = loaded();
    round.remove("s_2", LATER);

    const snapshot = round.toSnapshot();
    expect(snapshot.stops.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "s_1", position: 1 },
      { id: "s_3", position: 2 },
    ]);
    expect(snapshot.removedStops).toEqual([
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null, removedAt: LATER },
    ]);
  });

  it("refuse un arrêt inconnu, et un arrêt clos (I4)", () => {
    const round = loaded([
      { id: "s_0", orderId: "o_0", position: 1, closedAt: AT },
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
    ]);

    expect(() => round.remove("absent", LATER)).toThrow(DeliveryStopNotFoundError);
    expect(() => round.remove("s_0", LATER)).toThrow(DeliveryStopClosedError);
    expect(() => round.detach("s_0", LATER)).toThrow(DeliveryStopClosedError);
  });
});

describe("reorder — I2, permutation exacte", () => {
  it("range dans l'ordre donné", () => {
    const round = loaded();

    expect(round.reorder(["s_3", "s_1", "s_2"], LATER)).toBe(true);
    expect(round.orderIds).toEqual(["o_3", "o_1", "o_2"]);
    expect(round.toSnapshot().version).toBe(5);
  });

  it("un ordre identique ne change rien, pas même la version", () => {
    const round = loaded();

    expect(round.reorder(["s_1", "s_2", "s_3"], LATER)).toBe(false);
    expect(round.toSnapshot()).toMatchObject({ version: 4, updatedAt: AT });
  });

  it.each([
    ["un arrêt manquant", ["s_1", "s_2"]],
    ["un arrêt en double", ["s_1", "s_1", "s_2"]],
    ["un arrêt étranger", ["s_1", "s_2", "s_x"]],
    ["un arrêt de trop", ["s_1", "s_2", "s_3", "s_x"]],
  ])("refuse %s", (_label, stopIds) => {
    const round = loaded();

    expect(() => round.reorder(stopIds, LATER)).toThrow(InvalidStopOrderError);
    expect(round.orderIds).toEqual(["o_1", "o_2", "o_3"]);
  });

  it("refuse un arrêt clos dans la liste (I4)", () => {
    const round = loaded([
      { id: "s_0", orderId: "o_0", position: 1, closedAt: AT },
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
    ]);

    expect(() => round.reorder(["s_0", "s_1"], LATER)).toThrow(DeliveryStopClosedError);
  });
});
