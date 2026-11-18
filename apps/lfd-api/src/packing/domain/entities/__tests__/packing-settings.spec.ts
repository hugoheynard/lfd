import { PackingSettings } from "../packing-settings.js";
import { HalfSharingDisabledError } from "../../errors/packing-settings-errors.js";

describe("PackingSettings — le partage d'une moitié, fermé tant qu'on ne l'ouvre pas", () => {
  it("ferme le partage par défaut", () => {
    expect(PackingSettings.defaults().halfSharing).toBe(false);
    expect(() => PackingSettings.defaults().assertCanShareHalf()).toThrow(HalfSharingDisabledError);
  });

  it("laisse partager une moitié une fois ouvert", () => {
    expect(() =>
      PackingSettings.of({
        halfSharing: true,
        showMadeToOrder: true,
        pickupTrackingLevel: "simple",
      }).assertCanShareHalf(),
    ).not.toThrow();
  });

  it("nomme le réglage et le geste de sortie dans son refus", () => {
    expect(() =>
      PackingSettings.of({
        halfSharing: false,
        showMadeToOrder: true,
        pickupTrackingLevel: "simple",
      }).assertCanShareHalf(),
    ).toThrow(/Réglages › Colisage.*déclarez un bac/);
  });

  it("compare deux réglages par leur valeur", () => {
    expect(
      PackingSettings.of({
        halfSharing: true,
        showMadeToOrder: true,
        pickupTrackingLevel: "simple",
      }).equals(
        PackingSettings.of({
          halfSharing: true,
          showMadeToOrder: true,
          pickupTrackingLevel: "simple",
        }),
      ),
    ).toBe(true);
    expect(
      PackingSettings.defaults().equals(
        PackingSettings.of({
          halfSharing: true,
          showMadeToOrder: true,
          pickupTrackingLevel: "simple",
        }),
      ),
    ).toBe(false);
  });
});

describe("PackingSettings — la pastille « Sur mesure » (M4)", () => {
  it("l'affiche par défaut", () => {
    expect(PackingSettings.defaults().showMadeToOrder).toBe(true);
  });

  it("distingue deux réglages qui ne diffèrent que par elle", () => {
    expect(
      PackingSettings.of({
        halfSharing: false,
        showMadeToOrder: false,
        pickupTrackingLevel: "simple",
      }).equals(PackingSettings.defaults()),
    ).toBe(false);
  });
});

describe("PackingSettings — le niveau de suivi du retrait (D2)", () => {
  it("colise un retrait en simple tant que personne n'a rien réglé", () => {
    expect(PackingSettings.defaults().pickupTrackingLevel).toBe("simple");
  });

  it("deux réglages qui ne diffèrent que par le niveau ne sont pas égaux", () => {
    const simple = PackingSettings.of({
      halfSharing: false,
      showMadeToOrder: true,
      pickupTrackingLevel: "simple",
    });
    const detailed = PackingSettings.of({
      halfSharing: false,
      showMadeToOrder: true,
      pickupTrackingLevel: "detailed",
    });

    expect(simple.equals(detailed)).toBe(false);
    expect(simple.equals(PackingSettings.defaults())).toBe(true);
  });
});
