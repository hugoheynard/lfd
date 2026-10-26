import { QualityControlSettings } from "../quality-control-settings.js";
import { QualityControlDisabledError } from "../../errors/quality-control-settings-errors.js";

describe("QualityControlSettings — où le contrôle qualité se rend (Réglages › Commandes)", () => {
  it("désactive le fournil et garde le colisage par défaut", () => {
    const defaults = QualityControlSettings.defaults();

    expect(defaults.lineChecks).toBe(false);
    expect(defaults.orderChecks).toBe(true);
    expect(() => defaults.assertCanCheck("line")).toThrow(QualityControlDisabledError);
    expect(() => defaults.assertCanCheck("order")).not.toThrow();
  });

  it("refuse un verdict de commande quand le colisage est désactivé", () => {
    const settings = QualityControlSettings.of({ lineChecks: true, orderChecks: false });

    expect(() => settings.assertCanCheck("order")).toThrow(QualityControlDisabledError);
    expect(() => settings.assertCanCheck("line")).not.toThrow();
  });

  it("nomme le niveau, le réglage et le geste de sortie dans son refus", () => {
    expect(() => QualityControlSettings.defaults().assertCanCheck("line")).toThrow(
      /au fournil.*Réglages › Commandes.*réactiver/,
    );
    expect(() =>
      QualityControlSettings.of({ lineChecks: false, orderChecks: false }).assertCanCheck("order"),
    ).toThrow(/au colisage/);
  });

  it("compare deux réglages par leur valeur", () => {
    const open = { lineChecks: true, orderChecks: true };

    expect(QualityControlSettings.of(open).equals(QualityControlSettings.of(open))).toBe(true);
    expect(QualityControlSettings.defaults().equals(QualityControlSettings.of(open))).toBe(false);
  });
});
