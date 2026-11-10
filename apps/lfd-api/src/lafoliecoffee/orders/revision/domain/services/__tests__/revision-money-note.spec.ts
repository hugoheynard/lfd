import { revisionMoneyNoteOf } from "../revision-money-note.js";

describe("ce que l'argent devient après une révision", () => {
  it.each([
    ["account", 1_000, 1_200, "invoice"],
    ["account", 1_200, 1_000, "invoice"],
    ["free", 0, 300, "invoice"],
    ["paid", 1_000, 1_200, "card_charged"],
    ["due", 1_000, 1_200, "card_charged"],
    ["paid", 1_200, 1_000, "card_refunded"],
    ["paid", 1_000, 1_000, "none"],
    ["account", 1_000, 1_000, "none"],
  ] as const)("%s, %i → %i : %s", (settlement, before, after, note) => {
    expect(revisionMoneyNoteOf(settlement, before, after)).toBe(note);
  });
});
