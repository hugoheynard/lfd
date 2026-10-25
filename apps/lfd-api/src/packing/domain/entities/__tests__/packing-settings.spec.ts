import { PackingSettings } from "../packing-settings.js";
import { HalfSharingDisabledError } from "../../errors/packing-settings-errors.js";

describe("PackingSettings — le partage d'une moitié, fermé tant qu'on ne l'ouvre pas", () => {
  it("ferme le partage par défaut", () => {
    expect(PackingSettings.defaults().halfSharing).toBe(false);
    expect(() => PackingSettings.defaults().assertCanShareHalf()).toThrow(HalfSharingDisabledError);
  });

  it("laisse partager une moitié une fois ouvert", () => {
    expect(() => PackingSettings.of({ halfSharing: true }).assertCanShareHalf()).not.toThrow();
  });

  it("nomme le réglage et le geste de sortie dans son refus", () => {
    expect(() => PackingSettings.of({ halfSharing: false }).assertCanShareHalf()).toThrow(
      /Réglages › Colisage.*déclarez un bac/,
    );
  });

  it("compare deux réglages par leur valeur", () => {
    expect(
      PackingSettings.of({ halfSharing: true }).equals(PackingSettings.of({ halfSharing: true })),
    ).toBe(true);
    expect(PackingSettings.defaults().equals(PackingSettings.of({ halfSharing: true }))).toBe(
      false,
    );
  });
});
