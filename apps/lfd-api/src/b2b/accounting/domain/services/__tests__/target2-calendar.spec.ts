import {
  businessDaysBefore,
  easterSunday,
  isTarget2BusinessDay,
  onOrAfterBusinessDay,
} from "../target2-calendar.js";

/**
 * Les dates sont le SUJET de ces tests et ne sont comparées qu'entre elles :
 * aucune n'est rapportée à l'horloge (CLAUDE.md §5, la seule exception).
 */
describe("easterSunday — Meeus/Jones/Butcher", () => {
  it.each([
    [2000, "2000-04-23"],
    [2008, "2008-03-23"],
    [2011, "2011-04-24"],
    [2019, "2019-04-21"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("Pâques %i tombe le %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe("isTarget2BusinessDay", () => {
  it.each([
    ["2026-01-01", "1er janvier"],
    ["2026-04-03", "Vendredi saint 2026"],
    ["2026-04-06", "lundi de Pâques 2026"],
    ["2027-03-26", "Vendredi saint 2027"],
    ["2027-03-29", "lundi de Pâques 2027"],
    ["2026-05-01", "1er mai"],
    ["2026-12-25", "Noël"],
    ["2026-12-26", "lendemain de Noël"],
    ["2026-11-14", "un samedi"],
    ["2026-11-15", "un dimanche"],
  ])("%s est fermé (%s)", (day) => {
    expect(isTarget2BusinessDay(day)).toBe(false);
  });

  /** Fériés français, pas TARGET2 : une banque y règle. */
  it.each([
    ["2026-07-14", "14 juillet"],
    ["2025-08-15", "15 août (vendredi)"],
    ["2026-05-14", "Ascension 2026"],
    ["2026-05-25", "lundi de Pentecôte 2026"],
    ["2026-11-11", "11 novembre"],
    ["2026-04-02", "Jeudi saint"],
  ])("%s est ouvert (%s)", (day) => {
    expect(isTarget2BusinessDay(day)).toBe(true);
  });
});

describe("onOrAfterBusinessDay", () => {
  it("rend le jour lui-même quand il est ouvert", () => {
    expect(onOrAfterBusinessDay("2026-10-15")).toBe("2026-10-15");
  });

  it("saute le week-end de Pâques entier : du Vendredi saint au mardi", () => {
    expect(onOrAfterBusinessDay("2026-04-03")).toBe("2026-04-07");
  });

  it("saute Noël, le 26 et le week-end qui suit (2026 : vendredi, samedi, dimanche)", () => {
    expect(onOrAfterBusinessDay("2026-12-25")).toBe("2026-12-28");
  });

  it("traverse la fin d'année : samedi 1er janvier 2028 → lundi 3", () => {
    expect(onOrAfterBusinessDay("2027-12-31")).toBe("2027-12-31");
    expect(onOrAfterBusinessDay("2028-01-01")).toBe("2028-01-03");
  });
});

describe("businessDaysBefore", () => {
  it("compte les jours OUVRÉS, pas les jours de calendrier (lundi − 2 = jeudi)", () => {
    expect(businessDaysBefore("2026-11-16", 2)).toBe("2026-11-12");
  });

  it("saute le lundi de Pâques et le Vendredi saint (mardi 7 avril − 1 = jeudi 2)", () => {
    expect(businessDaysBefore("2026-04-07", 1)).toBe("2026-04-02");
  });
});
