import { addDays, localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { keepOrderable } from "../orderable-today.js";

// Dates comparées entre elles seulement : `now` est celle de la fixture, pas l'horloge.
const TODAY = "2026-03-10";
const TOMORROW = addDays(TODAY, 1);

/** Dix heures, la veille du jour visé. */
function now(): Date {
  const instant = localToInstant(TODAY, "10:00");
  if (instant === null) {
    throw new RangeError(`10:00 n'existe pas le ${TODAY} à Paris`);
  }
  return instant;
}

const COMMERCE_CLOSES_AT_NINE: OrderCutoffView = {
  id: "cutoff-1",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "09:00",
  graceMinutes: 0,
};

const open = { sku: "OPEN", orderTimeLimit: { daysBefore: 1, time: "18:00", graceMinutes: 0 } };
const closed = { sku: "CLOSED", orderTimeLimit: { daysBefore: 1, time: "09:00", graceMinutes: 0 } };
const inGrace = {
  sku: "GRACE",
  orderTimeLimit: { daysBefore: 1, time: "09:30", graceMinutes: 60 },
};
const followsCommerce = { sku: "COMMERCE", orderTimeLimit: null };

describe("keepOrderable", () => {
  const target = { date: TOMORROW, pickupAddressId: null };

  it("ne garde que les articles encore OUVERTS pour le jour visé — le rattrapage exige une dérogation", () => {
    const kept = keepOrderable({
      candidates: [closed, open, inGrace],
      inCart: new Set(),
      target,
      fallback: [],
      now: now(),
    });
    expect(kept.map((item) => item.sku)).toEqual(["OPEN"]);
  });

  it("oppose la règle du commerce à un article sans limite propre", () => {
    const kept = keepOrderable({
      candidates: [followsCommerce],
      inCart: new Set(),
      target,
      fallback: [COMMERCE_CLOSES_AT_NINE],
      now: now(),
    });
    expect(kept).toEqual([]);
  });

  it("n'oppose aucune heure tant qu'aucun jour n'est visé", () => {
    const kept = keepOrderable({
      candidates: [closed, open],
      inCart: new Set(),
      target: null,
      fallback: [COMMERCE_CLOSES_AT_NINE],
      now: now(),
    });
    expect(kept.map((item) => item.sku)).toEqual(["CLOSED", "OPEN"]);
  });

  it("retire ce qui est au panier et les doublons, en gardant l'ordre reçu", () => {
    const kept = keepOrderable({
      candidates: [open, followsCommerce, open, closed],
      inCart: new Set(["CLOSED"]),
      target: null,
      fallback: [],
      now: now(),
    });
    expect(kept.map((item) => item.sku)).toEqual(["OPEN", "COMMERCE"]);
  });

  it("rend une liste vide quand rien ne passe — jamais de remplissage", () => {
    expect(
      keepOrderable({ candidates: [closed], inCart: new Set(), target, fallback: [], now: now() }),
    ).toEqual([]);
  });
});
