import { DeliveryRound } from "../../entities/delivery-round.js";
import {
  CrossDayMoveError,
  OrderAlreadyInRoundError,
  SameRoundMoveError,
} from "../../errors/delivery-round-errors.js";
import { moveDeliveryStop } from "../move-delivery-stop.js";

const AT = new Date(0);
const LATER = new Date(60_000);

function round(id: string, serviceDay: string, orderIds: readonly string[]): DeliveryRound {
  return DeliveryRound.restore({
    id,
    serviceDay,
    vehicleId: `v_${id}`,
    vehicleName: `Véhicule ${id}`,
    passage: 1,
    version: 2,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops: orderIds.map((orderId, index) => ({
      id: `${id}_s${String(index + 1)}`,
      orderId,
      position: index + 1,
      closedAt: null,
    })),
  });
}

describe("moveDeliveryStop — I7", () => {
  it("détache de l'une, ajoute en dernier dans l'autre, la MÊME ligne (C11)", () => {
    const from = round("a", "2030-03-12", ["o_1", "o_2"]);
    const to = round("b", "2030-03-12", ["o_3"]);

    const moved = moveDeliveryStop(from, to, "a_s1", LATER, false);

    expect(moved).toEqual({ id: "a_s1", orderId: "o_1" });
    expect(from.orderIds).toEqual(["o_2"]);
    expect(to.orderIds).toEqual(["o_3", "o_1"]);
    expect(from.toSnapshot().removedStops).toEqual([]);
    expect(to.toSnapshot().stops.find((stop) => stop.id === "a_s1")?.position).toBe(2);
    expect([from.version, to.version]).toEqual([3, 3]);
  });

  it("refuse la même tournée", () => {
    const same = round("a", "2030-03-12", ["o_1"]);

    expect(() => moveDeliveryStop(same, same, "a_s1", LATER, false)).toThrow(SameRoundMoveError);
  });

  it("refuse un autre jour", () => {
    const from = round("a", "2030-03-12", ["o_1"]);
    const to = round("b", "2030-03-13", []);

    expect(() => moveDeliveryStop(from, to, "a_s1", LATER, false)).toThrow(CrossDayMoveError);
    expect(from.orderIds).toEqual(["o_1"]);
  });

  it("refuse une commande déjà dans la tournée d'arrivée", () => {
    const from = round("a", "2030-03-12", ["o_1"]);
    const to = round("b", "2030-03-12", ["o_1"]);

    expect(() => moveDeliveryStop(from, to, "a_s1", LATER, false)).toThrow(
      OrderAlreadyInRoundError,
    );
  });
});
