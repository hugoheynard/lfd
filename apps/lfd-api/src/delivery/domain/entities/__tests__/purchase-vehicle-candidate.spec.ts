import {
  InvalidPurchaseCandidateNameError,
  InvalidPurchasePriceError,
  InvalidPurchaseUrlError,
  PurchaseCandidateAlreadyArchivedError,
  PurchaseCandidateNotArchivedError,
} from "../../errors/delivery-purchase-errors.js";
import { InvalidCargoDimensionsError } from "../../errors/delivery-errors.js";
import { InvalidWheelArchesError } from "../../errors/delivery-floor-errors.js";
import type { DeliveryAuthor } from "../departure-choice.js";
import {
  PurchaseVehicleCandidate,
  type PurchaseVehicleCandidateSpec,
} from "../purchase-vehicle-candidate.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const ANNE: DeliveryAuthor = { staffUserId: "staff_1", name: "Anne B", role: "admin" };
const BRUNO: DeliveryAuthor = { staffUserId: "staff_2", name: "Bruno C", role: "comptoir" };

const ARCHES = { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 };

const SPEC: PurchaseVehicleCandidateSpec = {
  name: "Kangoo L2",
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: ARCHES,
  reference: "KL2",
  purchaseUrl: "https://exemple.fr/kangoo",
  priceCentsExclVat: 2_500_000,
};

function declared(spec: PurchaseVehicleCandidateSpec = SPEC): PurchaseVehicleCandidate {
  return PurchaseVehicleCandidate.declare({ ...spec, id: "pvc_1", at: AT, author: ANNE });
}

describe("PurchaseVehicleCandidate", () => {
  it("se déclare dans la bibliothèque, auteur figé, fiche explicite", () => {
    const candidate = declared();

    expect(candidate.inLibrary).toBe(true);
    expect(candidate.floor.volumeLiters).toBe(4125);
    expect(candidate.toState()).toEqual({
      id: "pvc_1",
      ...SPEC,
      createdAt: AT,
      createdByStaffId: "staff_1",
      updatedAt: AT,
      updatedBy: ANNE,
      archivedAt: null,
    });
  });

  it("rend null pour ce qui n'est pas renseigné — un prix inconnu n'est pas zéro", () => {
    const candidate = declared({ name: "Trafic", cargo: SPEC.cargo });

    expect(candidate.specification).toMatchObject({
      wheelArches: null,
      reference: null,
      purchaseUrl: null,
      priceCentsExclVat: null,
    });
  });

  it.each([
    ["un nom vide", { ...SPEC, name: "  " }, InvalidPurchaseCandidateNameError],
    ["un nom trop long", { ...SPEC, name: "x".repeat(61) }, InvalidPurchaseCandidateNameError],
    [
      "une dimension hors bornes (CargoSpace)",
      { ...SPEC, cargo: { ...SPEC.cargo, lengthCm: 1001 } },
      InvalidCargoDimensionsError,
    ],
    [
      "un passage qui sort du plancher (CargoFloor)",
      { ...SPEC, wheelArches: { ...ARCHES, fromBackCm: 200 } },
      InvalidWheelArchesError,
    ],
    [
      "un passage qui touche le plafond",
      { ...SPEC, wheelArches: { ...ARCHES, heightCm: 125 } },
      InvalidWheelArchesError,
    ],
    ["un lien http", { ...SPEC, purchaseUrl: "http://exemple.fr" }, InvalidPurchaseUrlError],
    ["un prix négatif", { ...SPEC, priceCentsExclVat: -1 }, InvalidPurchasePriceError],
  ])("refuse %s", (_label, spec, error) => {
    expect(() => declared(spec)).toThrow(error);
  });

  it("refuse une hauteur de passage nulle, à la déclaration comme à la relecture", () => {
    const flat = { ...ARCHES, heightCm: 0 };
    expect(() => declared({ ...SPEC, wheelArches: flat })).toThrow(InvalidWheelArchesError);
    expect(() =>
      PurchaseVehicleCandidate.restore({ ...declared().toState(), wheelArches: flat }),
    ).toThrow(InvalidWheelArchesError);
  });

  it("se corrige en entier, même archivé, sans revenir dans la bibliothèque", () => {
    const candidate = declared();
    candidate.archive(AT, ANNE);

    candidate.correct({ ...SPEC, name: "Kangoo L3", priceCentsExclVat: null }, LATER, BRUNO);

    expect(candidate.name).toBe("Kangoo L3");
    expect(candidate.inLibrary).toBe(false);
    expect(candidate.toState()).toMatchObject({
      priceCentsExclVat: null,
      updatedAt: LATER,
      updatedBy: BRUNO,
      createdByStaffId: "staff_1",
    });
  });

  it("ne corrige rien si la fiche est refusée", () => {
    const candidate = declared();
    expect(() =>
      candidate.correct({ ...SPEC, name: "Autre", priceCentsExclVat: -1 }, LATER, BRUNO),
    ).toThrow(InvalidPurchasePriceError);
    expect(candidate.name).toBe("Kangoo L2");
    expect(candidate.toState().updatedAt).toBe(AT);
  });

  it("s'archive une fois, se réactive une fois", () => {
    const candidate = declared();

    candidate.archive(LATER, BRUNO);
    expect(candidate.archivedAt).toBe(LATER);
    expect(() => candidate.archive(LATER, BRUNO)).toThrow(PurchaseCandidateAlreadyArchivedError);

    candidate.reactivate(LATER, ANNE);
    expect(candidate.inLibrary).toBe(true);
    expect(() => candidate.reactivate(LATER, ANNE)).toThrow(PurchaseCandidateNotArchivedError);
  });

  it("se réhydrate à l'identique", () => {
    const state = declared().toState();
    expect(PurchaseVehicleCandidate.restore(state).toState()).toEqual(state);
  });
});
