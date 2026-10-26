import { ShipmentRef } from "../../../../production/channels/delivery/index.js";
import { OrderAlreadyInRoundError } from "../../errors/delivery-round-errors.js";
import { DeliveryRound, type DeliveryRoundState } from "../delivery-round.js";
import { departedStopsOf, type DepartureSheet } from "../departure-sheet.js";

/**
 * **Un arrêt dessert un envoi** (plan E7 reliquat, lot L3c) : deux arrêts
 * d'une même commande, à deux rangs, sont deux arrêts distincts ; un rang
 * absent vaut 1, comme avant.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const AT = new Date(0);
const LATER = new Date(60_000);

function loaded(stops: DeliveryRoundState["stops"]): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 1,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops,
  });
}

const TWO_RANKS: DeliveryRoundState["stops"] = [
  { kind: "order", id: "s_1", orderId: "o_1", shipmentRank: 1, position: 1, closedAt: null },
  { kind: "order", id: "s_2", orderId: "o_1", shipmentRank: 2, position: 2, closedAt: null },
];

function sheet(): DepartureSheet {
  return {
    orderId: "o_1",
    reference: "C-1",
    customerLabel: "Maison Colin",
    address: null,
    contact: null,
    window: null,
    signatureRequired: false,
    note: "",
    addressNote: null,
    depositAllowed: false,
    doorstepRule: null,
    parking: null,
    status: "active",
  };
}

describe("DeliveryRound — deux arrêts d'une commande, deux rangs", () => {
  it("rend les deux envois, dans l'ordre de passage", () => {
    expect(loaded(TWO_RANKS).shipments).toEqual([
      ShipmentRef.firstOf("o_1"),
      ShipmentRef.of("o_1", 2),
    ]);
  });

  it("un arrêt sans rang est l'envoi de rang 1", () => {
    const round = loaded([
      { kind: "order", id: "s_1", orderId: "o_1", position: 1, closedAt: null },
    ]);

    expect(round.shipments).toEqual([ShipmentRef.firstOf("o_1")]);
  });

  it("le geste d'affectation pose le rang 1", () => {
    const round = loaded([]);

    round.assign("s_1", "o_1", LATER);

    expect(round.toSnapshot().stops).toMatchObject([{ orderId: "o_1", shipmentRank: 1 }]);
  });

  it("reçoit le rang 2 d'une commande dont le rang 1 est déjà là", () => {
    const round = loaded([TWO_RANKS[0]!]);

    round.attach({ kind: "order", id: "s_2", orderId: "o_1", shipmentRank: 2 }, LATER);

    expect(round.shipments).toHaveLength(2);
  });

  it("refuse un second arrêt du même envoi", () => {
    const round = loaded(TWO_RANKS);

    expect(() =>
      round.attach({ kind: "order", id: "s_3", orderId: "o_1", shipmentRank: 2 }, LATER),
    ).toThrow(OrderAlreadyInRoundError);
  });

  it("la feuille figée au départ porte le rang de chaque arrêt", () => {
    const departed = departedStopsOf(loaded(TWO_RANKS), LATER, [sheet()], new Map(), null);

    expect(departed.map((stop) => [stop.stopId, stop.shipmentRank])).toEqual([
      ["s_1", 1],
      ["s_2", 2],
    ]);
  });
});
