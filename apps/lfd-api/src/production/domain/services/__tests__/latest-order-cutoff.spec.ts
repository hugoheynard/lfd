import { localToInstant } from "@lfd/contracts";

import { HouseTime } from "../../value-objects/house-time.value-object.js";
import {
  latestOrderCutoff,
  type OrderCutoffRule,
  planClosesAt,
  planStopRules,
  planStopsAt,
} from "../latest-order-cutoff.js";

const rule = (daysBefore: number, time: string, graceMinutes = 0): OrderCutoffRule => ({
  daysBefore,
  time,
  graceMinutes,
});

describe("latestOrderCutoff — la limite la plus tardive, toutes règles confondues", () => {
  it("rend null sans aucune règle : le commerce n'a posé aucune limite", () => {
    expect(latestOrderCutoff([])).toBeNull();
  });

  it("prend la plus tardive des règles de la veille, rattrapage compris", () => {
    const latest = latestOrderCutoff([rule(1, "18:00"), rule(1, "17:00", 90), rule(2, "23:00")]);

    expect(latest).toEqual({ daysBefore: 1, time: HouseTime.of("18:30", "close") });
  });

  it("une limite à deux jours ne pèse que si rien n'est plus tard", () => {
    expect(latestOrderCutoff([rule(2, "20:00")])).toEqual({
      daysBefore: 2,
      time: HouseTime.of("20:00", "close"),
    });
  });

  it("un rattrapage qui passe minuit tombe le jour même", () => {
    expect(latestOrderCutoff([rule(1, "22:00", 180)])).toEqual({
      daysBefore: 0,
      time: HouseTime.of("01:00", "close"),
    });
  });
});

/** Les dates sont le SUJET : comparées entre elles, jamais à l'horloge. */
describe("planClosesAt — l'instant où le plan d'une journée s'arrête seul", () => {
  const paris = (day: string, time: string): Date | null => localToInstant(day, time);

  it("sans règle, rien ne l'arrête seul", () => {
    expect(planClosesAt(null, "2026-10-07")).toBeNull();
  });

  it("à la fin du rattrapage de la veille, à l'heure de Paris", () => {
    expect(planClosesAt(rule(1, "23:00", 30), "2026-10-07")).toEqual(paris("2026-10-06", "23:30"));
  });

  it("un rattrapage qui passe minuit tombe le jour même", () => {
    expect(planClosesAt(rule(1, "23:30", 60), "2026-10-07")).toEqual(paris("2026-10-07", "00:30"));
  });

  it("l'heure limite sautée au passage à l'heure d'été : pas d'instant", () => {
    expect(planClosesAt(rule(1, "02:30"), "2026-03-30")).toBeNull();
  });
});

/** Lot R3a du réassort (Hugo, 2026-10-21) : un seul arrêt, à la plus tardive des deux heures. */
describe("planStopsAt — l'heure générale et l'heure du réassort", () => {
  const paris = (day: string, time: string): Date | null => localToInstant(day, time);

  it("sans règle générale, aucune heure : l'heure du réassort seule n'arrête rien", () => {
    expect(planStopRules(null, "20:00")).toEqual([]);
    expect(planStopsAt(planStopRules(null, "20:00"), "2026-10-07")).toBeNull();
  });

  it("s'arrête à l'heure du réassort quand elle est plus tardive", () => {
    const rules = planStopRules(rule(1, "18:00", 30), "20:00");
    expect(planStopsAt(rules, "2026-10-07")).toEqual(paris("2026-10-06", "20:00"));
  });

  it("s'arrête à la fin du rattrapage quand il dépasse l'heure du réassort", () => {
    const rules = planStopRules(rule(1, "19:45", 30), "20:00");
    expect(planStopsAt(rules, "2026-10-07")).toEqual(paris("2026-10-06", "20:15"));
  });

  it("la page dit la plus tardive des deux, sans rattrapage pour le réassort", () => {
    expect(latestOrderCutoff(planStopRules(rule(1, "18:00", 30), "21:00"))).toEqual({
      daysBefore: 1,
      time: HouseTime.of("21:00", "close"),
    });
  });
});
