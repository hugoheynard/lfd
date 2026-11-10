import { InvalidDeliveryNoteNumberError } from "../../errors/delivery-note-errors.js";
import { DeliveryNoteNumber } from "../delivery-note-number.js";

describe("DeliveryNoteNumber — BL-<commande sans ORD->-<rang>", () => {
  it.each([
    ["ORD-1042", 1, "BL-1042-1"],
    ["ORD-1042", 2, "BL-1042-2"],
    // Q-E1-1 (Hugo, 2026-10-24) : l'ancien format suit la même règle.
    ["ORD-MV84O2XA-Y9W3", 1, "BL-MV84O2XA-Y9W3-1"],
  ])("%s, rang %d → %s", (order, rank, expected) => {
    expect(DeliveryNoteNumber.of(order, rank).value).toBe(expected);
  });

  it.each([
    ["CMD-1", 1],
    ["ORD-", 1],
    ["ORD-1", 0],
    ["ORD-1", 1.5],
  ])("refuse %s au rang %d", (order, rank) => {
    expect(() => DeliveryNoteNumber.of(order, rank)).toThrow(InvalidDeliveryNoteNumberError);
  });
});
