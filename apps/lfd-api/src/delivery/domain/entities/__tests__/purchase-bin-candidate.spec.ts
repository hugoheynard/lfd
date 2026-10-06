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
  outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
  inner: { lengthMm: 560, widthMm: 360, heightMm: 270 },
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

  it("se mesure au millimètre : la manne à pain (66,5 × 46 × 71,5 cm) se déclare telle quelle", () => {
    const manne = {
      ...SPEC,
      outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
      inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
    };

    expect(declared(manne).specification).toMatchObject({
      outer: manne.outer,
      inner: manne.inner,
    });
  });

  it("refuse une dimension qui n'est pas un nombre entier de millimètres", () => {
    expect(() => declared({ ...SPEC, outer: { ...SPEC.outer, lengthMm: 665.5 } })).toThrow(
      InvalidBinDimensionsError,
    );
  });

  it.each([
    ["un nom vide", { ...SPEC, name: "" }, InvalidPurchaseCandidateNameError],
    [
      "une dimension hors bornes",
      { ...SPEC, outer: { ...SPEC.outer, lengthMm: 3001 } },
      InvalidBinDimensionsError,
    ],
    [
      "un intérieur plus grand que l'extérieur",
      { ...SPEC, inner: { ...SPEC.inner, widthMm: 410 } },
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
