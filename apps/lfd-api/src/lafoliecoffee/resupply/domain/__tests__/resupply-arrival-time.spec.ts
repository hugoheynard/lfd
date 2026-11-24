import {
  arrivalByOf,
  assertArrivalFitsTarget,
  ResupplyArrivalTime,
} from "../resupply-arrival-time.js";
import {
  InvalidResupplyArrivalTimeError,
  ResupplyArrivalOnAsapError,
} from "../resupply-arrival-errors.js";

describe("ResupplyArrivalTime — l'heure d'arrivée voulue (H1)", () => {
  it.each(["00:00", "06:30", "13:00", "23:59"])("accepte %s", (value) => {
    expect(ResupplyArrivalTime.of(value).value).toBe(value);
  });

  it.each(["24:00", "6:30", "06:60", "06h30", " 06:30", "06:30:00", ""])(
    "refuse « %s », en nommant la forme attendue",
    (value) => {
      expect(() => ResupplyArrivalTime.of(value)).toThrow(InvalidResupplyArrivalTimeError);
      expect(() => ResupplyArrivalTime.of(value)).toThrow(/00:00 à 23:59/u);
    },
  );

  it("`null` reste sans heure", () => {
    expect(ResupplyArrivalTime.ofNullable(null)).toBeNull();
  });

  it("compare par sa valeur", () => {
    expect(ResupplyArrivalTime.of("06:30").equals(ResupplyArrivalTime.of("06:30"))).toBe(true);
    expect(ResupplyArrivalTime.of("06:30").equals(null)).toBe(false);
  });

  it("« au plus tôt » ne porte jamais d'heure ; « pour demain » peut ne pas en avoir encore", () => {
    expect(() => assertArrivalFitsTarget("asap", ResupplyArrivalTime.of("06:30"))).toThrow(
      ResupplyArrivalOnAsapError,
    );
    expect(() => assertArrivalFitsTarget("asap", null)).not.toThrow();
    expect(() => assertArrivalFitsTarget("tomorrow", null)).not.toThrow();
  });

  it("l'heure d'une composition (brouillon, modèle) : facultative, d'une forme juste, jamais sur `asap`", () => {
    expect(arrivalByOf("tomorrow", "06:30")).toBe("06:30");
    expect(arrivalByOf("tomorrow", null)).toBeNull();
    expect(() => arrivalByOf("tomorrow", "6h")).toThrow(InvalidResupplyArrivalTimeError);
    expect(() => arrivalByOf("asap", "06:30")).toThrow(ResupplyArrivalOnAsapError);
  });
});
