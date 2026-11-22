import {
  PROVIDER_CHECK_LIMIT,
  type ProviderCheckSelection,
  providerCheckSelection,
} from "../provider-check-schedule.js";

/** L'instant du balayage — rien ne le compare à l'heure réelle. */
const NOW = new Date("2030-01-10T09:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Le paiement né il y a `ageMs` et relu il y a `checkedMs` est-il dû ? (`null` : jamais relu). */
function due(selection: ProviderCheckSelection, ageMs: number, checkedMs: number | null): boolean {
  const createdAt = NOW.getTime() - ageMs;
  const checkedAt = checkedMs === null ? null : NOW.getTime() - checkedMs;
  return selection.bands.some(
    (band) =>
      createdAt >= band.createdFrom.getTime() &&
      createdAt < band.createdBefore.getTime() &&
      (checkedAt === null || checkedAt < band.checkedBefore.getTime()),
  );
}

describe("providerCheckSelection", () => {
  const selection = providerCheckSelection(NOW);

  it("laisse cinq minutes au webhook avant la première relecture", () => {
    expect(due(selection, 4 * MINUTE, null)).toBe(false);
    expect(due(selection, 5 * MINUTE + 1, null)).toBe(true);
  });

  it("abandonne à la relecture humaine un paiement de plus de sept jours", () => {
    expect(due(selection, 7 * DAY - MINUTE, null)).toBe(true);
    expect(due(selection, 7 * DAY + 1, null)).toBe(false);
    expect(due(selection, 8 * DAY, null)).toBe(false);
  });

  it("relit toutes les cinq minutes pendant la première heure", () => {
    expect(due(selection, 30 * MINUTE, 4 * MINUTE)).toBe(false);
    expect(due(selection, 30 * MINUTE, 5 * MINUTE + 1)).toBe(true);
  });

  it("relit toutes les heures jusqu'à vingt-quatre heures", () => {
    expect(due(selection, 3 * HOUR, 30 * MINUTE)).toBe(false);
    expect(due(selection, 3 * HOUR, HOUR + 1)).toBe(true);
  });

  it("relit toutes les six heures ensuite", () => {
    expect(due(selection, 3 * DAY, 5 * HOUR)).toBe(false);
    expect(due(selection, 3 * DAY, 6 * HOUR + 1)).toBe(true);
  });

  it("couvre l'horizon sans trou ni chevauchement entre les tranches", () => {
    const bands = selection.bands;
    expect(bands).toHaveLength(3);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]?.createdBefore).toEqual(bands[index - 1]?.createdFrom);
    }
    expect(selection.limit).toBe(PROVIDER_CHECK_LIMIT);
  });
});
