import type { Recurrence } from "@lfd/contracts";

import type { OccurrenceOverride } from "../../entities/subscription.js";
import { IsoDate } from "../../value-objects/iso-date.js";
import { SubscriptionLine } from "../../value-objects/subscription-line.js";
import { type OccurrenceSchedule, occurrencesBetween } from "../occurrence-calendar.js";

const d = (raw: string): IsoDate => IsoDate.fromString(raw);
const TEMPLATE = [SubscriptionLine.create("PAN-001", 4)];

function schedule(
  recurrence: Recurrence,
  startDate: string,
  endDate: string | null = null,
  overrides: readonly OccurrenceOverride[] = [],
): OccurrenceSchedule {
  return {
    recurrence,
    startDate: d(startDate),
    endDate: endDate === null ? null : d(endDate),
    lines: TEMPLATE,
    overrideOn: (date) => overrides.find((o) => o.date.equals(date)) ?? null,
  };
}

function datesOf(s: OccurrenceSchedule, from: string, to: string): readonly string[] {
  return occurrencesBetween(s, d(from), d(to)).map((o) => o.date.toString());
}

describe("occurrencesBetween — les cadences", () => {
  it("weekly : tous les 7 jours depuis le début", () => {
    expect(datesOf(schedule("weekly", "2026-11-02"), "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
  });

  it("biweekly : tous les 14 jours, en gardant la phase du début", () => {
    expect(datesOf(schedule("biweekly", "2026-11-02"), "2026-11-10", "2026-12-31")).toEqual([
      "2026-11-16",
      "2026-11-30",
      "2026-12-14",
      "2026-12-28",
    ]);
  });

  it("weekly : une fenêtre loin du début ne perd pas la phase", () => {
    expect(datesOf(schedule("weekly", "2024-01-01"), "2026-11-20", "2026-11-30")).toEqual([
      "2026-11-23",
      "2026-11-30",
    ]);
  });

  it("weekly : traverse le changement d'heure sans glisser d'un jour", () => {
    expect(datesOf(schedule("weekly", "2026-10-19"), "2026-10-19", "2026-11-02")).toEqual([
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
  });

  it("monthly : même quantième, et le passage d'année", () => {
    expect(datesOf(schedule("monthly", "2026-11-15"), "2026-11-01", "2027-02-28")).toEqual([
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
    ]);
  });
});

describe("occurrencesBetween — le mois court prend son dernier jour (Q4, Hugo 2026-11-23)", () => {
  it("le 31 tombe le 30 avril, puis revient le 31 mai", () => {
    expect(datesOf(schedule("monthly", "2027-03-31"), "2027-03-01", "2027-05-31")).toEqual([
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
  });

  it("le 31 janvier tombe le 28 février, et le 29 une année bissextile", () => {
    expect(datesOf(schedule("monthly", "2027-01-31"), "2027-02-01", "2027-02-28")).toEqual([
      "2027-02-28",
    ]);
    expect(datesOf(schedule("monthly", "2028-01-31"), "2028-02-01", "2028-02-29")).toEqual([
      "2028-02-29",
    ]);
  });

  it("le 30 ne remonte pas au 31 dans un mois long", () => {
    expect(datesOf(schedule("monthly", "2027-04-30"), "2027-05-01", "2027-05-31")).toEqual([
      "2027-05-30",
    ]);
  });
});

describe("occurrencesBetween — les bornes", () => {
  it("rien avant le début, même si la fenêtre commence plus tôt", () => {
    expect(datesOf(schedule("weekly", "2026-11-16"), "2026-11-01", "2026-11-20")).toEqual([
      "2026-11-16",
    ]);
  });

  it("rien après la fin, et la fin elle-même est comprise", () => {
    expect(
      datesOf(schedule("weekly", "2026-11-02", "2026-11-16"), "2026-11-01", "2026-12-31"),
    ).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("une fenêtre entièrement après la fin est vide", () => {
    expect(
      datesOf(schedule("weekly", "2026-11-02", "2026-11-16"), "2026-12-01", "2026-12-31"),
    ).toEqual([]);
  });

  it("une fenêtre inversée est vide", () => {
    expect(datesOf(schedule("weekly", "2026-11-02"), "2026-11-30", "2026-11-01")).toEqual([]);
  });

  it("les deux bornes de la fenêtre sont comprises", () => {
    expect(datesOf(schedule("weekly", "2026-11-02"), "2026-11-09", "2026-11-16")).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });
});

describe("occurrencesBetween — les dérogations", () => {
  it("une échéance sautée disparaît", () => {
    const s = schedule("weekly", "2026-11-02", null, [
      { date: d("2026-11-09"), skipped: true, lines: [], note: "" },
    ]);
    expect(datesOf(s, "2026-11-02", "2026-11-16")).toEqual(["2026-11-02", "2026-11-16"]);
  });

  it("une dérogation à lignes remplace le gabarit et porte sa note", () => {
    const lines = [SubscriptionLine.create("SUR-001", 2)];
    const s = schedule("weekly", "2026-11-02", null, [
      { date: d("2026-11-09"), skipped: false, lines, note: "sans sésame" },
    ]);
    const [plain, overridden] = occurrencesBetween(s, d("2026-11-02"), d("2026-11-09"));
    expect(plain).toEqual({ date: d("2026-11-02"), lines: TEMPLATE, note: "", overridden: false });
    expect(overridden).toEqual({
      date: d("2026-11-09"),
      lines,
      note: "sans sésame",
      overridden: true,
    });
  });

  it("une dérogation hors cadence ne crée pas d'échéance", () => {
    const s = schedule("weekly", "2026-11-02", null, [
      { date: d("2026-11-05"), skipped: false, lines: TEMPLATE, note: "" },
    ]);
    expect(datesOf(s, "2026-11-01", "2026-11-08")).toEqual(["2026-11-02"]);
  });
});
