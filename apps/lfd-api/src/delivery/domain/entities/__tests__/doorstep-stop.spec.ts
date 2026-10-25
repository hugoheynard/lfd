import { DoorstepStop, type DoorstepStopState } from "../doorstep-stop.js";
import { DepositSignatureRequiredError } from "../../errors/delivery-doorstep-errors.js";

// Un instant de départ qui n'est comparé à rien.
const DEPARTED = new Date(1_000);

function stop(overrides: Partial<DoorstepStopState> = {}): DoorstepStop {
  return DoorstepStop.restore({
    stopId: "s_1",
    orderId: "o_1",
    round: { roundId: "r_1", vehicleName: "Kangoo", serviceDay: "2030-03-12", passage: 1 },
    departedAt: DEPARTED,
    returnedAt: null,
    reference: "ORD-1",
    closedAt: null,
    signatureRequired: false,
    depositAllowed: false,
    decision: null,
    ...overrides,
  });
}

describe("DoorstepStop.ensureDepositPermitted — « Déposé avec preuve » (B2, AP-Q6)", () => {
  it("permis quand le dépôt est autorisé au départ et qu'aucune signature n'est exigée", () => {
    expect(() => stop({ depositAllowed: true }).ensureDepositPermitted()).not.toThrow();
  });

  /** Hugo, 2026-10-25 (« dépôt A ») : le « dépôt autorisé » du client n'est plus exigé. */
  it("permis sans signature exigée, même dépôt NON autorisé à l'adresse", () => {
    expect(() => stop({ depositAllowed: false }).ensureDepositPermitted()).not.toThrow();
  });

  it("🔴 la signature exigée l'emporte, même dépôt autorisé (AP-Q6)", () => {
    expect(() =>
      stop({ depositAllowed: true, signatureRequired: true }).ensureDepositPermitted(),
    ).toThrow(DepositSignatureRequiredError);
  });

  it("signature exigée sans dépôt autorisé : refus nommé, la commande citée", () => {
    expect(() => stop({ signatureRequired: true }).ensureDepositPermitted()).toThrow(
      DepositSignatureRequiredError,
    );
    expect(() => stop({ signatureRequired: true }).ensureDepositPermitted()).toThrow(/ORD-1/);
  });

  it("sans instantané, la commande est nommée par son id", () => {
    expect(() => stop({ reference: "", signatureRequired: true }).ensureDepositPermitted()).toThrow(
      /o_1/,
    );
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
    expect(() =>
      stop({ signatureRequired: true, decision: "pending" }).ensureDepositPermitted(),
    ).toThrow(DepositSignatureRequiredError);
    expect(() =>
      stop({ signatureRequired: true, decision: "bring_back" }).ensureDepositPermitted(),
    ).toThrow(DepositSignatureRequiredError);
  });

  it("« rapportée » se lit sur l'arrêt", () => {
    expect(stop({ decision: "bring_back" }).broughtBack).toBe(true);
    expect(stop({ decision: "authorize_deposit" }).broughtBack).toBe(false);
  });
});

describe("DoorstepStop.ensureDepositPermitted — l'arrêt clos ou la tournée rentrée", () => {
  // La règle ne lit ni `closedAt` ni `returnedAt` : ces refus-là appartiennent
  // à la tournée (`closeStop`), pas à la règle du dépôt. On fige que la règle
  // reste celle de la signature, quel que soit l'état de la tournée.
  it("signature exigée sans autorisation : refus, tournée rentrée ou arrêt clos ou non", () => {
    const later = new Date(2_000);
    for (const state of [{}, { returnedAt: later }, { closedAt: later }]) {
      expect(() => stop({ signatureRequired: true, ...state }).ensureDepositPermitted()).toThrow(
        DepositSignatureRequiredError,
      );
    }
  });

  it("autorisation du commercial : permis même tournée rentrée", () => {
    expect(() =>
      stop({
        signatureRequired: true,
        decision: "authorize_deposit",
        returnedAt: new Date(2_000),
      }).ensureDepositPermitted(),
    ).not.toThrow();
  });
});
