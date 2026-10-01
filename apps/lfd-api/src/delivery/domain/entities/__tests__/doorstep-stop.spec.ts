import { DoorstepStop, type DoorstepStopState } from "../doorstep-stop.js";
import {
  DeliveryRoundReturnedError,
  DoorstepRoundNotDepartedError,
  DoorstepStopClosedError,
} from "../../errors/delivery-doorstep-errors.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTED = new Date(1_000);
const ARRIVED = new Date(2_000);
const LATER = new Date(3_000);

function stop(overrides: Partial<DoorstepStopState> = {}): DoorstepStop {
  return DoorstepStop.restore({
    stopId: "s_1",
    orderId: "o_1",
    round: { roundId: "r_1", vehicleName: "Kangoo", serviceDay: "2030-03-12", passage: 1 },
    departedAt: DEPARTED,
    returnedAt: null,
    reference: "CMD-1",
    closedAt: null,
    arrivedAt: null,
    signatureRequired: false,
    ...overrides,
  });
}

describe("DoorstepStop.arrive — « Je suis arrivé » (AP-D6)", () => {
  it("pose l'instant d'arrivée, une fois", () => {
    const door = stop();

    expect(door.arrive(ARRIVED)).toBe(true);
    expect(door.arrivedAt).toBe(ARRIVED);
  });

  it("une seconde arrivée ne réécrit rien : le premier instant fait foi", () => {
    const door = stop({ arrivedAt: ARRIVED });

    expect(door.arrive(LATER)).toBe(false);
    expect(door.arrivedAt).toBe(ARRIVED);
  });

  it("rejouée sur un arrêt arrivé PUIS clos, elle répond encore « déjà fait »", () => {
    const door = stop({ arrivedAt: ARRIVED, closedAt: LATER });

    expect(door.arrive(LATER)).toBe(false);
  });

  it("refuse une tournée encore au dépôt", () => {
    expect(() => stop({ departedAt: null }).arrive(ARRIVED)).toThrow(DoorstepRoundNotDepartedError);
  });

  it("refuse une tournée rentrée (PL2)", () => {
    expect(() => stop({ returnedAt: LATER }).arrive(ARRIVED)).toThrow(DeliveryRoundReturnedError);
  });

  it("refuse un arrêt clos sans arrivée déclarée", () => {
    expect(() => stop({ closedAt: LATER }).arrive(ARRIVED)).toThrow(DoorstepStopClosedError);
  });
});
