import {
  BinInnerExceedsOuterError,
  InvalidBinDimensionsError,
  InvalidBinMaxStackError,
} from "../../errors/delivery-bin-errors.js";
import {
  InvalidPurchaseCandidateNameError,
  InvalidPurchasePriceError,
  InvalidPurchaseTextError,
  InvalidPurchaseUrlError,
  PurchaseCandidateAlreadyArchivedError,
  PurchaseCandidateNotArchivedError,
} from "../../errors/delivery-purchase-errors.js";
import type { DeliveryAuthor } from "../departure-choice.js";
import { PurchaseBinCandidate, type PurchaseBinCandidateSpec } from "../purchase-bin-candidate.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const ANNE: DeliveryAuthor = { staffUserId: "staff_1", name: "Anne B", role: "admin" };

const SPEC: PurchaseBinCandidateSpec = {
  name: "Caisse Dupont 50",
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
  isotherm: true,
  maxStack: 5,
  supplier: "Dupont",
  reference: "CD-50",
  purchaseUrl: "https://exemple.fr/cd50",
  unitPriceCentsExclVat: 1_290,
};

function declared(spec: PurchaseBinCandidateSpec = SPEC): PurchaseBinCandidate {
  return PurchaseBinCandidate.declare({ ...spec, id: "pbc_1", at: AT, author: ANNE });
}

describe("PurchaseBinCandidate", () => {
  it("se déclare, fiche explicite, géométrie par BinFormat", () => {
    const candidate = declared();

    expect(candidate.format.inner.volumeLiters).toBe(54);
    expect(candidate.toState()).toEqual({
      id: "pbc_1",
      ...SPEC,
      createdAt: AT,
      createdByStaffId: "staff_1",
      updatedAt: AT,
      updatedBy: ANNE,
      archivedAt: null,
    });
  });

  it("rend null pour l'achat non renseigné", () => {
    const {
      supplier: _s,
      reference: _r,
      purchaseUrl: _u,
      unitPriceCentsExclVat: _p,
      ...bare
    } = SPEC;
    expect(declared(bare).specification).toMatchObject({
      supplier: null,
      reference: null,
      purchaseUrl: null,
      unitPriceCentsExclVat: null,
    });
  });

  it.each([
    ["un nom vide", { ...SPEC, name: "" }, InvalidPurchaseCandidateNameError],
    [
      "une dimension hors bornes",
      { ...SPEC, outer: { ...SPEC.outer, lengthCm: 301 } },
      InvalidBinDimensionsError,
    ],
    [
      "un intérieur plus grand que l'extérieur",
      { ...SPEC, inner: { ...SPEC.inner, widthCm: 41 } },
      BinInnerExceedsOuterError,
    ],
    ["une pile nulle", { ...SPEC, maxStack: 0 }, InvalidBinMaxStackError],
    ["une pile démesurée", { ...SPEC, maxStack: 21 }, InvalidBinMaxStackError],
    ["un fournisseur trop long", { ...SPEC, supplier: "x".repeat(121) }, InvalidPurchaseTextError],
    [
      "un lien javascript:",
      { ...SPEC, purchaseUrl: "javascript:alert(1)" },
      InvalidPurchaseUrlError,
    ],
    ["un prix négatif", { ...SPEC, unitPriceCentsExclVat: -1 }, InvalidPurchasePriceError],
    ["un prix non entier", { ...SPEC, unitPriceCentsExclVat: 12.9 }, InvalidPurchasePriceError],
  ])("refuse %s", (_label, spec, error) => {
    expect(() => declared(spec)).toThrow(error);
  });

  it("s'archive une fois, se réactive une fois, se corrige archivé", () => {
    const candidate = declared();
    candidate.archive(LATER, ANNE);
    expect(() => candidate.archive(LATER, ANNE)).toThrow(PurchaseCandidateAlreadyArchivedError);

    candidate.correct({ ...SPEC, maxStack: 4 }, LATER, ANNE);
    expect(candidate.inLibrary).toBe(false);
    expect(candidate.specification.maxStack).toBe(4);

    candidate.reactivate(LATER, ANNE);
    expect(() => candidate.reactivate(LATER, ANNE)).toThrow(PurchaseCandidateNotArchivedError);
  });

  it("se réhydrate à l'identique", () => {
    const state = declared().toState();
    expect(PurchaseBinCandidate.restore(state).toState()).toEqual(state);
  });
});
