import { addDays, localToInstant } from "@lfd/contracts";

import { judgeOrderable } from "../orderable-today.js";

// Dates comparées entre elles seulement : `now` est celle de la fixture, pas l'horloge.
const TODAY = "2026-03-10";

function now(): Date {
  const instant = localToInstant(TODAY, "10:00");
  if (instant === null) {
    throw new RangeError(`10:00 n'existe pas le ${TODAY} à Paris`);
  }
  return instant;
}

const open = { sku: "OPEN", orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 } };
const closed = { sku: "CLOSED", orderTimeLimit: { daysBefore: 1, time: "09:00", graceMinutes: 0 } };

describe("judgeOrderable", () => {
  it("nomme la raison de chaque écart : au panier, fermé ce jour-là, doublon", () => {
    const verdicts = judgeOrderable({
      candidates: [open, closed, { ...open, sku: "CART" }, open],
      inCart: new Set(["CART"]),
      target: { date: addDays(TODAY, 1), pickupAddressId: null },
      fallback: [],
      now: now(),
    });

    expect(verdicts.map(({ candidate, refusal }) => [candidate.sku, refusal])).toEqual([
      ["OPEN", null],
      ["CLOSED", "item_not_orderable_that_day"],
      ["CART", "item_in_cart"],
      ["OPEN", "duplicate"],
    ]);
  });

  it("sans jour visé, rien n'est fermé", () => {
    const verdicts = judgeOrderable({
      candidates: [closed],
      inCart: new Set(),
      target: null,
      fallback: [],
      now: now(),
    });

    expect(verdicts.map(({ refusal }) => refusal)).toEqual([null]);
  });
});
