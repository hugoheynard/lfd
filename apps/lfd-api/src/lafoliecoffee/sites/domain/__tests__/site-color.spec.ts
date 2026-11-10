import { SiteColor } from "../site-color.js";
import { SiteColorFormatError } from "../site-errors.js";

describe("SiteColor — la forme", () => {
  it("accepte #rrggbb et le rend en minuscules", () => {
    expect(SiteColor.of("#1E40AF").hex).toBe("#1e40af");
  });

  it.each(["1e40af", "#1e40a", "#1e40afe", "#ggg000", "", "blue"])("refuse « %s »", (value) => {
    expect(() => SiteColor.of(value)).toThrow(SiteColorFormatError);
  });
});

/**
 * Hugo, 2026-10-13 : les couleurs sont entièrement libres. La demande
 * d'origine réservait vert et rouge / rose aux surligneurs OK / KO ; la règle
 * a été retirée, l'équipe s'organise entre elle.
 */
describe("SiteColor — aucune teinte refusée", () => {
  it.each([
    ["vert", "#16a34a"],
    ["rouge", "#dc2626"],
    ["rose", "#ec4899"],
    ["bleu", "#2563eb"],
    ["jaune", "#facc15"],
    ["gris", "#9ca3af"],
    ["blanc", "#ffffff"],
    ["noir", "#000000"],
  ])("accepte le %s (%s)", (_name, hex) => {
    expect(SiteColor.of(hex).hex).toBe(hex);
  });
});
