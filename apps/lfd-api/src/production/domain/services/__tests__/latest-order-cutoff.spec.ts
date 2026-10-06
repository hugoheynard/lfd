import { HouseTime } from "../../value-objects/house-time.value-object.js";
import {
  closesBeforeCutoff,
  describeCutoff,
  latestOrderCutoff,
  type OrderCutoffRule,
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

describe("closesBeforeCutoff — l'heure d'arrêt précède-t-elle la limite ?", () => {
  const at = (time: string) => HouseTime.of(time, "close");

  it("la veille : avant la limite oui, à la limite ou après non", () => {
    const cutoff = { daysBefore: 1, time: at("18:00") };

    expect(closesBeforeCutoff(at("17:59"), cutoff)).toBe(true);
    expect(closesBeforeCutoff(at("18:00"), cutoff)).toBe(false);
    expect(closesBeforeCutoff(at("21:00"), cutoff)).toBe(false);
  });

  it("une limite plus tôt que la veille ne gêne jamais, une limite le jour même toujours", () => {
    expect(closesBeforeCutoff(at("12:00"), { daysBefore: 2, time: at("23:00") })).toBe(false);
    expect(closesBeforeCutoff(at("23:55"), { daysBefore: 0, time: at("06:00") })).toBe(true);
  });
});

describe("describeCutoff", () => {
  it("dit la limite en mots", () => {
    expect(describeCutoff({ daysBefore: 1, time: HouseTime.of("18:00", "close") })).toBe(
      "la veille à 18:00",
    );
    expect(describeCutoff({ daysBefore: 0, time: HouseTime.of("01:00", "close") })).toBe(
      "le jour même à 01:00",
    );
    expect(describeCutoff({ daysBefore: 2, time: HouseTime.of("20:00", "close") })).toBe(
      "2 jours avant à 20:00",
    );
  });
});
