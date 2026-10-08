import {
  collectionCalendar,
  collectionDayOf,
  frozenCollectionDay,
} from "../collection-calendar.js";

/**
 * Le calendrier est pur : ses dates ne sont comparées qu'entre elles, jamais à
 * l'horloge — l'exception étroite de CLAUDE.md §5.
 *
 * Les clôtures sont des 1er du mois à 00h00 de Paris : 22h ou 23h UTC la veille
 * selon la saison, et c'est le jour LOCAL qui compte.
 */
const OCTOBER_1 = new Date("2026-09-30T22:00:00.000Z");
const NOVEMBER_1 = new Date("2026-10-31T23:00:00.000Z");
const MARCH_1_2027 = new Date("2027-02-28T23:00:00.000Z");
const APRIL_1_2026 = new Date("2026-03-31T22:00:00.000Z");

const DEFAULTS = {
  preNotificationDays: 14,
  collectionDaysAfterClosure: null,
  autoCollectionDelayHours: 1,
  depositCutoff: null,
};

describe("collectionDayOf — l'échéance", () => {
  it("N par défaut = le délai de pré-notification, du jour LOCAL de la clôture", () => {
    expect(collectionDayOf(OCTOBER_1, 14, null)).toBe("2026-10-15");
  });

  it("N réglé l'emporte sur le délai (le 5 : N = 4)", () => {
    expect(collectionDayOf(OCTOBER_1, 4, 4)).toBe("2026-10-05");
  });

  it("reporte au jour ouvré suivant (1er nov. + 14 = dimanche 15 → lundi 16)", () => {
    expect(collectionDayOf(NOVEMBER_1, 14, null)).toBe("2026-11-16");
  });

  it("traverse la fin d'un mois court (1er mars 2027 + 30 = 31 mars, mercredi)", () => {
    expect(collectionDayOf(MARCH_1_2027, 14, 30)).toBe("2027-03-31");
  });

  it("saute Pâques (1er avril 2026 + 2 = Vendredi saint → mardi 7)", () => {
    expect(collectionDayOf(APRIL_1_2026, 2, 2)).toBe("2026-04-07");
  });
});

describe("collectionCalendar", () => {
  it("constitution prévue = clôture + délai ; aucune date limite tant que le cut-off manque", () => {
    const calendar = collectionCalendar(OCTOBER_1, { ...DEFAULTS, autoCollectionDelayHours: 3 });

    expect(calendar).toEqual({
      closesAt: OCTOBER_1,
      plannedConstitutionAt: new Date("2026-10-01T01:00:00.000Z"),
      collectionDay: "2026-10-15",
      depositDeadline: null,
    });
  });

  it("la date limite de dépôt compte k jours OUVRÉS avant l'échéance, à l'heure dite", () => {
    const calendar = collectionCalendar(NOVEMBER_1, {
      ...DEFAULTS,
      depositCutoff: { businessDaysBefore: 2, time: "16:00" },
    });

    // Échéance lundi 16 → deux jours ouvrés avant : jeudi 12.
    expect(calendar.depositDeadline).toEqual({ day: "2026-11-12", time: "16:00" });
  });
});

/**
 * D4 (Hugo, 2026-10-08) : une constitution tardive ne raccourcit jamais le
 * préavis. Les dates ne sont comparées qu'entre elles — la clôture, l'instant
 * de constitution et l'échéance — jamais à l'horloge.
 */
describe("frozenCollectionDay — l'échéance figée sur le lot (D4)", () => {
  /** Clôture du 1er octobre 2026, 00h00 à Paris. */
  const CLOSURE = new Date("2026-09-30T22:00:00.000Z");

  it("constitué le jour de la clôture : l'échéance du calendrier, pas de report", () => {
    const constitutedAt = new Date("2026-09-30T23:00:00.000Z");

    expect(frozenCollectionDay(CLOSURE, constitutedAt, 14, null)).toEqual({
      day: "2026-10-15",
      postponedFrom: null,
    });
  });

  it("constitué le lendemain : le préavis compte depuis la constitution, et l'écart se dit", () => {
    const constitutedAt = new Date("2026-10-02T09:00:00.000Z");

    expect(frozenCollectionDay(CLOSURE, constitutedAt, 14, null)).toEqual({
      day: "2026-10-16",
      postponedFrom: "2026-10-15",
    });
  });

  it("constitué très tard : le report tombe un samedi, il glisse au lundi TARGET2", () => {
    // 3 octobre + 14 = samedi 17 octobre → lundi 19.
    const constitutedAt = new Date("2026-10-03T08:00:00.000Z");

    expect(frozenCollectionDay(CLOSURE, constitutedAt, 14, null)).toEqual({
      day: "2026-10-19",
      postponedFrom: "2026-10-15",
    });
  });

  it("un N plus long que le préavis absorbe le retard : pas de report", () => {
    // Clôture + 20 = 21 octobre ; constitution le 2 + 14 = 16 : on garde le 21.
    const constitutedAt = new Date("2026-10-02T09:00:00.000Z");

    expect(frozenCollectionDay(CLOSURE, constitutedAt, 14, 20)).toEqual({
      day: "2026-10-21",
      postponedFrom: null,
    });
  });

  it("le report ne saute jamais un jour fermé : l'échéance du calendrier déjà reportée suffit", () => {
    // Clôture du 1er décembre 2026 (Paris) + 23 = 24 décembre, jeudi ouvré.
    // Constitution le 11 + 14 = 25 décembre, fermé TARGET2 (et le 26) → lundi 28.
    const closure = new Date("2026-11-30T23:00:00.000Z");
    const constitutedAt = new Date("2026-12-11T09:00:00.000Z");

    expect(frozenCollectionDay(closure, constitutedAt, 14, 23)).toEqual({
      day: "2026-12-28",
      postponedFrom: "2026-12-24",
    });
  });
});
