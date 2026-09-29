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

describe("departedStopsOf — la feuille figée au départ", () => {
  it("fige une feuille par arrêt vivant, note de l'adresse comprise", () => {
    expect(departedStopsOf(ROUND, AT, [sheet()])).toEqual([
      { stopId: "s_1", roundId: "r_1", serviceDay: "2030-03-12", departedAt: AT, sheet: sheet() },
    ]);
  });

  it("refuse une commande annulée, en la nommant", () => {
    expect(() => departedStopsOf(ROUND, AT, [sheet({ status: "cancelled" })])).toThrow(
      DepartureOrderCancelledError,
    );
  });

  it("refuse une commande que le commerce ne sert plus, plutôt qu'une feuille inventée", () => {
    expect(() => departedStopsOf(ROUND, AT, [])).toThrow(DepartureSheetMissingError);
  });
});
