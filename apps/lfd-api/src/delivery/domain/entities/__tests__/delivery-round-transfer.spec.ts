import { DeliveryRound, type DeliveryRoundState } from "../delivery-round.js";
import {
  DeliveryRoundCorruptedError,
  InvalidStopPositionError,
  TransferAlreadyInRoundError,
  TransferStopNotAnOrderError,
} from "../../errors/delivery-round-errors.js";
import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import { unreadyStops } from "../departure-readiness.js";

// Des jours de service comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);
const VAL_VILLAGE = { id: "t_1", siteLabel: "Val Village" };

function round(stops: DeliveryRoundState["stops"]): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 2,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops,
  });
}

const TWO_ORDERS: DeliveryRoundState["stops"] = [
  { kind: "order", id: "s_1", orderId: "o_1", position: 1, closedAt: null },
  { kind: "order", id: "s_2", orderId: "o_2", position: 2, closedAt: null },
];

describe("l'arrêt de transfert interne dans une tournée (lot T1, §4)", () => {
  it("s'insère à la place donnée ; ses commandes ne sont pas celles de la tournée", () => {
    const tour = round(TWO_ORDERS);

    tour.assignTransfer("s_t", VAL_VILLAGE, LATER, 1);

    expect(tour.liveStops.map((stop) => stop.id)).toEqual(["s_1", "s_t", "s_2"]);
    expect(tour.orderIds).toEqual(["o_1", "o_2"]);
    expect(tour.transferIds).toEqual(["t_1"]);
    expect(tour.toSnapshot().stops).toContainEqual({
      kind: "transfer",
      id: "s_t",
      transferId: "t_1",
      position: 2,
      closedAt: null,
    });
    expect(tour.plannedTiming).toBeNull();
  });

  it("un transfert = un arrêt : le même transfert deux fois est refusé", () => {
    const tour = round(TWO_ORDERS);
    tour.assignTransfer("s_t", VAL_VILLAGE, LATER, 0);

    expect(() => tour.assignTransfer("s_u", VAL_VILLAGE, LATER, 0)).toThrow(
      TransferAlreadyInRoundError,
    );
  });

  it("refuse une place que la tournée n'a pas", () => {
    expect(() => round(TWO_ORDERS).assignTransfer("s_t", VAL_VILLAGE, LATER, 3)).toThrow(
      InvalidStopPositionError,
    );
  });

  it("une tournée partie ne reçoit pas de transfert (I6)", () => {
    const tour = DeliveryRound.restore({
      ...round(TWO_ORDERS).toSnapshot(),
      departedAt: AT,
    });

    expect(() => tour.assignTransfer("s_t", VAL_VILLAGE, LATER, 0)).toThrow(
      DeliveryRoundDepartedError,
    );
  });

  it("se relit, et refuse les gestes de la porte (pas de commande à remettre)", () => {
    const tour = round([
      ...TWO_ORDERS,
      { kind: "transfer", id: "s_t", transferId: "t_1", position: 3, closedAt: null },
    ]);

    expect(tour.transferIds).toEqual(["t_1"]);
    expect(() => tour.orderOf("s_t")).toThrow(TransferStopNotAnOrderError);
    expect(tour.orderOf("s_1")).toBe("o_1");
  });

  it("garde I2 : des positions trouées sont refusées, arrêts de transfert compris", () => {
    expect(() =>
      round([
        { kind: "order", id: "s_1", orderId: "o_1", position: 1, closedAt: null },
        { kind: "transfer", id: "s_t", transferId: "t_1", position: 3, closedAt: null },
      ]),
    ).toThrow(DeliveryRoundCorruptedError);
  });

  it("au départ, un arrêt de transfert sans état de chargement est tenu pour non étiqueté", () => {
    const tour = round([
      { kind: "transfer", id: "s_t", transferId: "t_1", position: 1, closedAt: null },
    ]);

    expect(unreadyStops(tour.liveStops, []).unlabelled).toEqual(["t_1"]);
  });
});
