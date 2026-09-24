import { FORMATS, type PlacedBlock } from "../grid.js";
import {
  allowedSides,
  defaultSide,
  mediaFitOf,
  mediaSideOf,
  mobileSide,
  setMedia,
  sideForShape,
} from "../media.js";

const ALL = ["all"] as const;

const tile: PlacedBlock = { id: "t", format: "tile", column: 1, row: 1, shelves: ALL };
const card: PlacedBlock = { id: "c", format: "card", column: 3, row: 1, shelves: ALL };
const hero: PlacedBlock = { id: "h", format: "hero", column: 3, row: 5, shelves: ALL };
const band2: PlacedBlock = { id: "d", format: "doubleBand", column: 1, row: 3, shelves: ALL };

describe("l’image de l’objet", () => {
  it("chaque forme permet ses côtés, et le premier est son défaut", () => {
    const read = FORMATS.map((f) => `${f.format}: ${allowedSides(f.format).join(" ")}`);
    expect(read).toEqual([
      "card: top full",
      "kakemono: top full",
      "tile: left right full",
      "block: left right top full",
      "hero: left right full",
      "band: left right full",
      "doubleBand: left right full",
    ]);
    expect(defaultSide("card")).toBe("top");
    expect(defaultSide("kakemono")).toBe("top");
    expect(defaultSide("block")).toBe("left");
    expect(defaultSide("band")).toBe("left");
  });

  it("sans réglage : remplir, et le côté par défaut de la forme", () => {
    expect(mediaFitOf(card)).toBe("cover");
    expect(mediaSideOf(card)).toBe("top");
    expect(mediaSideOf(tile)).toBe("left");
  });

  it("sideForShape garde un côté encore permis, sinon rend le défaut de la forme", () => {
    expect(sideForShape("band", "right")).toBe("right");
    expect(sideForShape("card", "full")).toBe("full");
    expect(sideForShape("card", "left")).toBe("top");
    expect(sideForShape("tile", "top")).toBe("left");
    expect(sideForShape("block", "top")).toBe("top");
    expect(sideForShape("hero", undefined)).toBe("left");
  });

  it("un côté enregistré devenu invalide se lit comme le défaut", () => {
    expect(mediaSideOf({ ...card, mediaSide: "right" })).toBe("top");
  });

  it("setMedia règle cadrage et côté, et ignore un côté non permis", () => {
    expect(setMedia([tile, card], "t", { fit: "contain", side: "right" })).toEqual([
      { ...tile, mediaFit: "contain", mediaSide: "right" },
      card,
    ]);
    expect(setMedia([card], "c", { side: "left" })).toEqual([card]);
    expect(setMedia([card], "c", { fit: "contain", side: "left" })).toEqual([
      { ...card, mediaFit: "contain" },
    ]);
    expect(setMedia([card], "nope", { fit: "contain" })).toEqual([card]);
  });

  it("en pile, l’image passe en haut — sauf plein, qui reste plein", () => {
    expect(mobileSide({ ...band2, mediaSide: "right" })).toBe("top");
    expect(mobileSide({ ...hero, mediaSide: "left" })).toBe("top");
    expect(mobileSide({ ...block2x2(), mediaSide: "top" })).toBe("top");
    expect(mobileSide({ ...band2, mediaSide: "full" })).toBe("full");
    expect(mobileSide({ ...card, mediaSide: "full" })).toBe("full");
  });

  it("réduit à une carte en pile, l’objet garde son plein", () => {
    expect(mobileSide({ ...tile, applyOnMobile: false, mediaSide: "full" })).toBe("full");
    expect(mobileSide({ ...tile, applyOnMobile: false, mediaSide: "right" })).toBe("top");
  });
});

function block2x2(): PlacedBlock {
  return { id: "q", format: "block", column: 1, row: 1, shelves: ALL };
}
