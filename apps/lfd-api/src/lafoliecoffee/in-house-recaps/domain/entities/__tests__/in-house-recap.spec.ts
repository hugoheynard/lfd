import {
  EmptyInHouseRecapError,
  InHouseRecapAlreadyReplacedError,
  InHouseRecapDocumentAlreadyKeptError,
  RecapNoteDuplicatedError,
  RecapNoteOutsideMonthError,
} from "../../errors/in-house-recap-errors.js";
import type { RecapSourceNote } from "../../services/recap-aggregation.js";
import { RecapMonth } from "../../value-objects/recap-month.js";
import { InHouseRecap } from "../in-house-recap.js";

const OCTOBER = RecapMonth.fromKey("2026-10");
const IN_OCTOBER = new Date("2026-10-12T09:00:00.000Z");
const ISSUED_AT = new Date("2026-11-01T00:30:00.000Z");

function note(id: string, at: Date, quantity = 3, version = 1): RecapSourceNote {
  return {
    deliveryNoteId: id,
    number: `BL-${id}`,
    handedOverAt: at,
    contentVersion: version,
    lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity }],
  };
}

function issue(notes: readonly RecapSourceNote[]): InHouseRecap {
  return InHouseRecap.issue({
    id: "recap-1",
    payerId: "resto",
    month: OCTOBER,
    number: "RBL-202610-0001",
    issuedAt: ISSUED_AT,
    notes,
  });
}

describe("InHouseRecap.issue", () => {
  it("agrège les lignes et fige la version de chaque BL", () => {
    const state = issue([note("a", IN_OCTOBER), note("b", IN_OCTOBER, 2, 4)]).toState();
    expect(state.lines).toEqual([
      { sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity: 5 },
    ]);
    expect(state.notes.map((one) => [one.deliveryNoteId, one.contentVersion])).toEqual([
      ["a", 1],
      ["b", 4],
    ]);
    expect(state).toMatchObject({ storageKey: null, replacedById: null, replacedAt: null });
  });

  it("refuse un BL remis hors du mois — le reliquat entre au mois de SA remise", () => {
    const november = new Date("2026-11-02T09:00:00.000Z");
    expect(() => issue([note("a", IN_OCTOBER), note("b", november)])).toThrow(
      RecapNoteOutsideMonthError,
    );
  });

  it("refuse un même BL deux fois", () => {
    expect(() => issue([note("a", IN_OCTOBER), note("a", IN_OCTOBER)])).toThrow(
      RecapNoteDuplicatedError,
    );
  });

  it("refuse un récapitulatif sans quantité : un mois vide est une issue, pas un document", () => {
    expect(() => issue([])).toThrow(EmptyInHouseRecapError);
    expect(() => issue([note("a", IN_OCTOBER, 0)])).toThrow(EmptyInHouseRecapError);
  });
});

describe("InHouseRecap — révision et rectificatif (D8)", () => {
  it("signale les BL dont la version courante dépasse la figée", () => {
    const recap = issue([note("a", IN_OCTOBER), note("b", IN_OCTOBER, 1, 2)]);
    const revised = recap.revisedNotes([
      { deliveryNoteId: "a", contentVersion: 2 },
      { deliveryNoteId: "b", contentVersion: 2 },
    ]);
    expect(revised.map((one) => one.deliveryNoteId)).toEqual(["a"]);
  });

  it("réémettre : un rectificatif du même payeur et du même mois, l'ancien marqué remplacé", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    const later = new Date("2026-11-20T10:00:00.000Z");
    const rectified = recap.reissue({
      id: "recap-2",
      number: "RBL-202610-0002",
      issuedAt: later,
      notes: [note("a", IN_OCTOBER, 7, 2)],
    });
    expect(rectified.toState()).toMatchObject({ payerId: "resto", replacedById: null });
    expect(rectified.month.key).toBe("2026-10");
    expect(rectified.toState().lines[0]?.quantity).toBe(7);
    expect(recap.toState()).toMatchObject({ replacedById: "recap-2", replacedAt: later });
    expect(recap.isReplaced).toBe(true);
  });

  it("refuse de réémettre un récapitulatif déjà remplacé", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    const next = {
      id: "recap-2",
      number: "RBL-202610-0002",
      issuedAt: ISSUED_AT,
      notes: [note("a", IN_OCTOBER)],
    };
    recap.reissue(next);
    expect(() => recap.reissue({ ...next, id: "recap-3" })).toThrow(
      InHouseRecapAlreadyReplacedError,
    );
  });

  it("un rectificatif sans BL est refusé, et l'ancien n'est pas marqué", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    expect(() =>
      recap.reissue({ id: "recap-2", number: "RBL-202610-0002", issuedAt: ISSUED_AT, notes: [] }),
    ).toThrow(EmptyInHouseRecapError);
    expect(recap.isReplaced).toBe(false);
  });
});

describe("InHouseRecap.recordDocument", () => {
  const KEY = "in-house-recaps/resto/RBL-202610-0001.pdf";

  it("pose la clé du PDF sur un récapitulatif qui n'en a pas", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    expect(recap.recordDocument(KEY)).toBe(true);
    expect(recap.storageKey).toBe(KEY);
  });

  it("la même clé une seconde fois ne change rien", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    recap.recordDocument(KEY);
    expect(recap.recordDocument(KEY)).toBe(false);
    expect(recap.storageKey).toBe(KEY);
  });

  it("refuse une autre clé : le PDF parti est le seul gardé", () => {
    const recap = issue([note("a", IN_OCTOBER)]);
    recap.recordDocument(KEY);
    expect(() => recap.recordDocument("in-house-recaps/resto/autre.pdf")).toThrow(
      InHouseRecapDocumentAlreadyKeptError,
    );
    expect(recap.storageKey).toBe(KEY);
  });
});
