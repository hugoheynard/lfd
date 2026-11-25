import { DeliveryNote } from "../../entities/delivery-note.js";
import {
  BREAD,
  CROISSANT,
  PLANNED_AT,
  plannedNote,
  VAT_SHARES,
} from "./delivery-note-sheet.fixture.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { versionToKeep, versionViewsOf } from "../delivery-note-version.js";

/**
 * **Quelle version d'un bon se fige, et pourquoi** (plan du reliquat, § 5 ter) :
 * la naissance, puis chaque montée de version — jamais une écriture sans
 * changement de contenu. Instants recopiés, jamais comparés à l'horloge.
 */
const SOURCE = {
  orderId: "ord_1",
  orderNumber: "ORD-1042",
  lines: [BREAD, CROISSANT],
  terms: { ...ORDER_TERMS, vatShares: VAT_SHARES },
};

describe("versionToKeep", () => {
  it("un bon qui n'existait pas fige sa version, née", () => {
    expect(versionToKeep(null, 1, null)).toEqual({ contentVersion: 1, cause: "born" });
  });

  it("une version qui monte se fige avec la cause de l'agrégat", () => {
    expect(versionToKeep(1, 2, "departure_decided")).toEqual({
      contentVersion: 2,
      cause: "departure_decided",
    });
  });

  it("une montée sans cause connue se dit réécrite", () => {
    expect(versionToKeep(2, 3, null)).toEqual({ contentVersion: 3, cause: "replanned" });
  });

  it("une écriture sans changement de contenu (un pas d'état, une impression) ne fige rien", () => {
    expect(versionToKeep(2, 2, null)).toBeNull();
    expect(versionToKeep(2, 2, "replanned")).toBeNull();
  });
});

describe("DeliveryNote.contentChangeCause", () => {
  it("rien à la naissance ni au chargement", () => {
    const note = plannedNote();
    expect(note.contentChangeCause).toBeNull();
    expect(DeliveryNote.rehydrate(note.toState()).contentChangeCause).toBeNull();
  });

  it("une réécriture identique ne change ni la version ni la cause", () => {
    const note = DeliveryNote.rehydrate(plannedNote().toState());
    note.replanFrom(SOURCE);
    expect(note.toState().contentVersion).toBe(1);
    expect(note.contentChangeCause).toBeNull();
  });

  it("une réécriture qui change les lignes se dit `replanned`", () => {
    const note = DeliveryNote.rehydrate(plannedNote().toState());
    note.replanFrom({ ...SOURCE, lines: [BREAD] });
    expect(note.toState().contentVersion).toBe(2);
    expect(note.contentChangeCause).toBe("replanned");
  });

  it("le départ décidé se dit `departure_decided`", () => {
    const note = DeliveryNote.rehydrate(plannedNote().toState());
    note.replanFrom({ ...SOURCE, lines: [{ ...CROISSANT, quantity: 1 }], departureDecided: true });
    expect(note.toState().contentVersion).toBe(2);
    expect(note.contentChangeCause).toBe("departure_decided");
  });
});

describe("versionViewsOf", () => {
  it("rend les versions par numéro croissant, instants en ISO", () => {
    const later = new Date(PLANNED_AT.getTime() + 60_000);
    expect(
      versionViewsOf([
        { contentVersion: 2, cause: "departure_decided", recordedAt: later },
        { contentVersion: 1, cause: "born", recordedAt: PLANNED_AT },
      ]),
    ).toEqual([
      { version: 1, cause: "born", recordedAt: PLANNED_AT.toISOString() },
      { version: 2, cause: "departure_decided", recordedAt: later.toISOString() },
    ]);
  });
});
