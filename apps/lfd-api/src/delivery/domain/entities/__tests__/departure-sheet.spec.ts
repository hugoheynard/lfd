import { DeliveryRound } from "../delivery-round.js";
import { departedStopsOf, type DepartureSheet } from "../departure-sheet.js";
import {
  DepartureOrderCancelledError,
  DepartureSheetMissingError,
} from "../../errors/delivery-loading-errors.js";

const AT = new Date(0);

const ROUND = DeliveryRound.restore({
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
  stops: [{ id: "s_1", orderId: "o_1", position: 1, closedAt: null }],
});

function sheet(overrides: Partial<DepartureSheet> = {}): DepartureSheet {
  return {
    orderId: "o_1",
    reference: "C-1",
    customerLabel: "Maison Colin",
    address: null,
    contact: null,
    window: null,
    signatureRequired: true,
    note: "par la cour",
    addressNote: "sonner deux fois",
    status: "active",
    ...overrides,
  };
}

const NO_POINTS = new Map<string, null>();

describe("departedStopsOf — la feuille figée au départ", () => {
  it("fige une feuille par arrêt vivant, note de l'adresse comprise", () => {
    expect(departedStopsOf(ROUND, AT, [sheet()], NO_POINTS)).toEqual([
      {
        stopId: "s_1",
        roundId: "r_1",
        serviceDay: "2030-03-12",
        departedAt: AT,
        sheet: sheet(),
        departureRank: 1,
        gps: null,
      },
    ]);
  });

  it("fige le rang de passage et le point du carnet de chaque arrêt (MT-D5 v2)", () => {
    const two = DeliveryRound.restore({
      ...ROUND.toSnapshot(),
      stops: [
        { id: "s_b", orderId: "o_2", position: 1, closedAt: null },
        { id: "s_a", orderId: "o_1", position: 2, closedAt: null },
      ],
    });
    const point = { lat: 45.9, lng: 6.12 };

    const departed = departedStopsOf(
      two,
      AT,
      [sheet(), sheet({ orderId: "o_2", reference: "C-2" })],
      new Map([["o_2", point]]),
    );

    expect(departed.map((stop) => [stop.stopId, stop.departureRank, stop.gps])).toEqual([
      ["s_b", 1, point],
      ["s_a", 2, null],
    ]);
  });

  it("refuse une commande annulée, en la nommant", () => {
    expect(() => departedStopsOf(ROUND, AT, [sheet({ status: "cancelled" })], NO_POINTS)).toThrow(
      DepartureOrderCancelledError,
    );
  });

  it("refuse une commande que le commerce ne sert plus, plutôt qu'une feuille inventée", () => {
    expect(() => departedStopsOf(ROUND, AT, [], NO_POINTS)).toThrow(DepartureSheetMissingError);
  });
});
