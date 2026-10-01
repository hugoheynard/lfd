import { DoorstepStop, type DoorstepStopState } from "../doorstep-stop.js";
import {
  DeliveryRoundReturnedError,
  DepositNotAllowedError,
  DepositSignatureRequiredError,
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
    depositAllowed: false,
    decision: null,
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

describe("DoorstepStop.ensureDepositPermitted — « Déposé avec preuve » (B2, AP-Q6)", () => {
  it("permis quand le dépôt est autorisé au départ et qu'aucune signature n'est exigée", () => {
    expect(() => stop({ depositAllowed: true }).ensureDepositPermitted()).not.toThrow();
  });

  it("refuse un dépôt que le client n'a pas autorisé, en nommant la commande", () => {
    expect(() => stop().ensureDepositPermitted()).toThrow(DepositNotAllowedError);
    expect(() => stop().ensureDepositPermitted()).toThrow(/CMD-1/);
  });

  it("🔴 la signature exigée l'emporte, même dépôt autorisé (AP-Q6)", () => {
    expect(() =>
      stop({ depositAllowed: true, signatureRequired: true }).ensureDepositPermitted(),
    ).toThrow(DepositSignatureRequiredError);
  });

  it("signature exigée sans dépôt autorisé : c'est la signature qui est nommée", () => {
    expect(() => stop({ signatureRequired: true }).ensureDepositPermitted()).toThrow(
      DepositSignatureRequiredError,
    );
  });

  it("sans instantané, la commande est nommée par son id", () => {
    expect(() => stop({ reference: "" }).ensureDepositPermitted()).toThrow(/o_1/);
  });
});

describe("DoorstepStop.ensureDepositPermitted — la décision du commercial (B3, LB-Q5)", () => {
  it("🔴 une autorisation du commercial l'emporte sur la signature exigée", () => {
    const door = stop({ signatureRequired: true, decision: "authorize_deposit" });

    expect(() => door.ensureDepositPermitted()).not.toThrow();
  });

  it("une autorisation du commercial suffit sans « dépôt autorisé » à l'adresse", () => {
    expect(() => stop({ decision: "authorize_deposit" }).ensureDepositPermitted()).not.toThrow();
  });

  it("🔴 une décision qui attend, ou « Rapporter », n'ouvre pas le dépôt", () => {
    expect(() => stop({ decision: "pending" }).ensureDepositPermitted()).toThrow(
      DepositNotAllowedError,
    );
    expect(() =>
      stop({ signatureRequired: true, decision: "bring_back" }).ensureDepositPermitted(),
    ).toThrow(DepositSignatureRequiredError);
  });

  it("« rapportée » se lit sur l'arrêt", () => {
    expect(stop({ decision: "bring_back" }).broughtBack).toBe(true);
    expect(stop({ decision: "authorize_deposit" }).broughtBack).toBe(false);
  });
});
