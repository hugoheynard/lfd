import { DeliveryRound } from "../delivery-round.js";
import {
  DeliveryRoundReturnedError,
  RoundNotDepartedForReturnError,
  RoundStopsWithoutOutcomeError,
} from "../../errors/delivery-doorstep-errors.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTED = new Date(1_000);
const RETURNED = new Date(9_000);
const LATER = new Date(10_000);
const PAUL = { staffUserId: "staff_paul", name: "Paul Roux" };

function round(departedAt: Date | null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 3,
    departedAt,
    driverStaffId: "staff_paul",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
    ],
  });
}

describe("DeliveryRound.returnToDepot — « Tournée terminée » (PL2, I8)", () => {
  it("pose l'instant et l'auteur, une fois ; les arrêts ouverts le restent", () => {
    const departed = round(DEPARTED);

    expect(departed.returnToDepot(RETURNED, PAUL)).toBe(true);

    const snapshot = departed.toSnapshot();
    expect(snapshot.returned).toEqual({
      at: RETURNED,
      byStaffId: "staff_paul",
      byName: "Paul Roux",
    });
    expect(departed.returnedAt).toBe(RETURNED);
    expect(departed.liveStops).toHaveLength(2);
    expect(departed.version).toBe(4);
  });

  it("un second retour ne réécrit rien : le premier fait foi", () => {
    const departed = round(DEPARTED);
    departed.returnToDepot(RETURNED, PAUL);

    expect(departed.returnToDepot(LATER, { staffUserId: "staff_admin", name: "" })).toBe(false);
    expect(departed.returnedAt).toBe(RETURNED);
  });

  it("refuse une tournée qui n'est pas partie, en nommant le véhicule", () => {
    expect(() => round(null).returnToDepot(RETURNED, PAUL)).toThrow(RoundNotDepartedForReturnError);
    expect(() => round(null).returnToDepot(RETURNED, PAUL)).toThrow(/« Kangoo »/u);
  });

  it("rentrée, elle refuse la clôture d'un arrêt", () => {
    const departed = round(DEPARTED);
    departed.returnToDepot(RETURNED, PAUL);

    expect(() => departed.closeStop("s_1", LATER)).toThrow(DeliveryRoundReturnedError);
  });

  it("se relit rentrée : le retour traverse la réhydratation", () => {
    const departed = round(DEPARTED);
    departed.returnToDepot(RETURNED, PAUL);

    const reread = DeliveryRound.restore(departed.toSnapshot());

    expect(reread.returnedAt).toEqual(RETURNED);
    expect(() => reread.ensureOnTheRoad()).toThrow(DeliveryRoundReturnedError);
  });
});

describe("DeliveryRound.finish — le livreur exige un sort pour chaque arrêt (B4, I9)", () => {
  const LABELS = new Map([
    ["o_1", "Refuge 1950 (CMD-1)"],
    ["o_2", "Chalet Lou (CMD-2)"],
  ]);

  // Chaque sort ferme l'arrêt par `closeStop` — remise, dépôt, clôture sans
  // remise, « Rapporter » du commercial, rapporté par réglage. La tournée ne
  // retient que la clôture ; c'est elle que la règle lit.
  it.each([
    ["remis au client"],
    ["déposé avec preuve"],
    ["clos sans remise"],
    ["rapporté par un commercial"],
    ["rapporté par réglage"],
  ])("termine quand chaque arrêt est clos — dont un « %s »", () => {
    const departed = round(DEPARTED);
    departed.closeStop("s_1", RETURNED);
    departed.closeStop("s_2", RETURNED);

    expect(departed.finish(LATER, PAUL, LABELS)).toBe(true);
    expect(departed.returnedAt).toBe(LATER);
  });

  it("refuse un arrêt seulement signalé, ou en attente du commercial : il est encore vivant, et nommé", () => {
    const departed = round(DEPARTED);
    departed.closeStop("s_1", RETURNED);

    expect(() => departed.finish(LATER, PAUL, LABELS)).toThrow(RoundStopsWithoutOutcomeError);
    expect(() => departed.finish(LATER, PAUL, LABELS)).toThrow(
      /un arrêt n'a pas de sort \(Chalet Lou \(CMD-2\)\)/u,
    );
    expect(departed.returnedAt).toBeNull();
    expect(departed.version).toBe(4);
  });

  it("nomme tous les arrêts sans sort, dans l'ordre de passage", () => {
    let refused: unknown = null;
    try {
      round(DEPARTED).finish(LATER, PAUL, LABELS);
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(RoundStopsWithoutOutcomeError);
    expect(refused instanceof RoundStopsWithoutOutcomeError ? refused.stops : []).toEqual([
      "Refuge 1950 (CMD-1)",
      "Chalet Lou (CMD-2)",
    ]);
    expect(refused instanceof Error ? refused.message : "").toMatch(/2 arrêts n'ont pas de sort/u);
  });

  it("déjà rentrée par le staff avec des arrêts ouverts : `false`, sans refus — le premier retour fait foi", () => {
    const departed = round(DEPARTED);
    departed.returnToDepot(RETURNED, { staffUserId: "staff_admin", name: "" });

    expect(departed.finish(LATER, PAUL, LABELS)).toBe(false);
    expect(departed.returnedAt).toBe(RETURNED);
  });

  it("au dépôt, le refus reste « pas partie »", () => {
    expect(() => round(null).finish(LATER, PAUL, LABELS)).toThrow(RoundNotDepartedForReturnError);
  });
});
