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
      safetyMarginMinutes: 20,
      defaultContainer: null,
      binGapCm: 1,
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
    ["safetyMarginMinutes", -1, "marge de sécurité"],
    ["safetyMarginMinutes", 91, "marge de sécurité"],
    ["safetyMarginMinutes", 7.5, "marge de sécurité"],
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
      safetyMarginMinutes: 90,
      defaultContainer: { binTypeId: "manne", count: 50 },
      binGapCm: 10,
    });

    expect(settings.earliestDepartureMinute).toBe(0);
    expect(
      RoutingSettings.define({ ...RoutingSettings.DEFAULTS, safetyMarginMinutes: 0 })
        .safetyMarginMinutes,
    ).toBe(0);
  });

  describe("le jeu entre bacs (G5a, 2026-10-08)", () => {
    it("vaut 1 cm d'usine, la constante que le plan lisait", () => {
      expect(RoutingSettings.defaults().binGapCm).toBe(1);
    });

    it("refuse un jeu hors de 0 à 10 cm ou non entier ; 0 est permis", () => {
      for (const binGapCm of [-1, 11, 1.5]) {
        expect(() => RoutingSettings.define({ ...RoutingSettings.DEFAULTS, binGapCm })).toThrow(
          InvalidRoutingSettingError,
        );
      }
      expect(RoutingSettings.define({ ...RoutingSettings.DEFAULTS, binGapCm: 0 }).binGapCm).toBe(0);
    });
  });

  describe("le contenant par défaut d'une commande (2026-10-06)", () => {
    const withContainer = (binTypeId: string, count: number) =>
      RoutingSettings.define({
        ...RoutingSettings.DEFAULTS,
        defaultContainer: { binTypeId, count },
      });

    it("vaut « pas de réglage » d'usine", () => {
      expect(RoutingSettings.defaults().defaultContainer).toBeNull();
    });

    it("refuse un nombre hors de 1 à 50 ou non entier, et un type vide", () => {
      for (const count of [0, -1, 51, 1.5]) {
        expect(() => withContainer("manne", count)).toThrow(InvalidRoutingSettingError);
      }
      expect(() => withContainer("  ", 1)).toThrow("type de bac");
    });

    it("se relit tel quel", () => {
      expect(withContainer("manne", 3).values().defaultContainer).toEqual({
        binTypeId: "manne",
        count: 3,
      });
    });
  });
});
