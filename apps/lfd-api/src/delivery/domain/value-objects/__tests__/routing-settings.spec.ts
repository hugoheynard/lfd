import { InvalidRoutingSettingError } from "../../errors/delivery-routing-errors.js";
import { RoutingSettings } from "../routing-settings.js";

describe("les réglages du calcul (L7-C13, L7-C15)", () => {
  it("valent les défauts de Hugo tant que personne n'a réglé", () => {
    const settings = RoutingSettings.defaults();

    expect(settings.values()).toEqual({
      detourPercent: 140,
      averageSpeedKmh: 35,
      earliestDeparture: "06:00",
      maxRoundMinutes: 240,
      stopMinutes: 5,
      defaultMode: "new_rounds",
      multiplePassages: true,
    });
    expect(settings.earliestDepartureMinute).toBe(360);
  });

  it.each([
    ["detourPercent", 99, "détour"],
    ["detourPercent", 301, "détour"],
    ["averageSpeedKmh", 4, "vitesse"],
    ["averageSpeedKmh", 400, "vitesse"],
    ["maxRoundMinutes", 29, "durée maximale"],
    ["stopMinutes", -1, "temps d'arrêt"],
    ["stopMinutes", 2.5, "temps d'arrêt"],
  ] as const)("refuse %s = %s en nommant le réglage", (field, value, words) => {
    const define = () => RoutingSettings.define({ ...RoutingSettings.DEFAULTS, [field]: value });

    expect(define).toThrow(InvalidRoutingSettingError);
    expect(define).toThrow(words);
  });

  it("refuse une heure de départ qui n'en est pas une", () => {
    expect(() =>
      RoutingSettings.define({ ...RoutingSettings.DEFAULTS, earliestDeparture: "25:00" }),
    ).toThrow("HH:MM");
  });

  it("refuse un mode de proposition inconnu", () => {
    expect(() =>
      RoutingSettings.define({
        ...RoutingSettings.DEFAULTS,
        defaultMode: JSON.parse('"tout"') as "insert",
      }),
    ).toThrow("insert");
  });

  it("accepte les bornes elles-mêmes", () => {
    const settings = RoutingSettings.define({
      detourPercent: 100,
      averageSpeedKmh: 130,
      earliestDeparture: "00:00",
      maxRoundMinutes: 720,
      stopMinutes: 0,
      defaultMode: "insert",
      multiplePassages: false,
    });

    expect(settings.earliestDepartureMinute).toBe(0);
  });
});
