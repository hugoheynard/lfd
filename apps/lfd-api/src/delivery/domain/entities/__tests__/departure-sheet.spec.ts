import { DeliveryRound } from "../delivery-round.js";
import { departedStopsOf, type DepartureSheet, refuseHeldOrders } from "../departure-sheet.js";
import {
  DepartureOrderCancelledError,
  DepartureOrderHeldError,
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
    depositAllowed: false,
    doorstepRule: null,
    status: "active",
    ...overrides,
  };
}

const NO_POINTS = new Map<string, null>();

describe("departedStopsOf — la feuille figée au départ", () => {
  it("fige une feuille par arrêt vivant, note de l'adresse comprise", () => {
    expect(departedStopsOf(ROUND, AT, [sheet()], NO_POINTS, null)).toEqual([
      {
        stopId: "s_1",
        roundId: "r_1",
        serviceDay: "2030-03-12",
        departedAt: AT,
        sheet: sheet(),
        departureRank: 1,
        gps: null,
        doorstepRule: "ask",
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
      null,
    );

    expect(departed.map((stop) => [stop.stopId, stop.departureRank, stop.gps])).toEqual([
      ["s_b", 1, point],
      ["s_a", 2, null],
    ]);
  });

  it("fige la règle d'avance à la porte : l'adresse l'emporte sur le réglage global (B3 bis)", () => {
    const rule = (globalRule: "deposit" | "bring_back" | null, addressRule: "ask" | null) =>
      departedStopsOf(ROUND, AT, [sheet({ doorstepRule: addressRule })], NO_POINTS, globalRule)[0]
        ?.doorstepRule;

    expect(rule("bring_back", null)).toBe("bring_back");
    expect(rule("deposit", "ask")).toBe("ask");
    expect(rule(null, null)).toBe("ask");
  });

  it("refuse une commande annulée, en la nommant", () => {
    expect(() =>
      departedStopsOf(ROUND, AT, [sheet({ status: "cancelled" })], NO_POINTS, null),
    ).toThrow(DepartureOrderCancelledError);
  });

  it("refuse une commande que le commerce ne sert plus, plutôt qu'une feuille inventée", () => {
    expect(() => departedStopsOf(ROUND, AT, [], NO_POINTS, null)).toThrow(
      DepartureSheetMissingError,
    );
  });
});

describe("refuseHeldOrders — une commande retenue ne part pas (BQ)", () => {
  it("nomme l'arrêt retenu par sa référence et son client", () => {
    expect(() => refuseHeldOrders(ROUND, [sheet()], new Set(["o_1"]))).toThrow(
      "« Kangoo blanc » ne peut pas partir : l'arrêt C-1 (Maison Colin) est retenu au contrôle qualité. Levez la retenue à la Supervision, ou retirez l'arrêt de la tournée, puis partez.",
    );
  });

  it("sans feuille, nomme la commande par son identifiant plutôt que d'inventer une référence", () => {
    expect(() => refuseHeldOrders(ROUND, [], new Set(["o_1"]))).toThrow(DepartureOrderHeldError);
    expect(() => refuseHeldOrders(ROUND, [], new Set(["o_1"]))).toThrow(/l'arrêt o_1 est retenu/u);
  });

  it("une retenue sur une commande hors de la tournée, ou aucune retenue : rien à refuser", () => {
    expect(() => refuseHeldOrders(ROUND, [sheet()], new Set(["o_9"]))).not.toThrow();
    expect(() => refuseHeldOrders(ROUND, [sheet()], new Set())).not.toThrow();
  });
});
