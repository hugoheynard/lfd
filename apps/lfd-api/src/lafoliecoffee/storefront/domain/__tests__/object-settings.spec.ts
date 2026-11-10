import { ObjectSettings } from "../object-settings.js";
import { InvalidStorefrontError } from "../storefront-errors.js";
import { CAROUSEL, settings } from "./storefront-fixtures.js";

describe("ObjectSettings", () => {
  it("accepte une carte réglée comme l'éditeur la pose", () => {
    expect(ObjectSettings.of(settings()).state).toMatchObject({ shape: "card", tone: "light" });
  });

  it("refuse un côté d'image que la forme ne permet pas — une carte n'a pas de gauche", () => {
    expect(() => ObjectSettings.of(settings({ shape: "card", mediaSide: "left" }))).toThrow(
      /« Carte 1×1 » ne place pas son image « left » : choisissez parmi top, full/u,
    );
  });

  it("permet au bloc les quatre côtés", () => {
    for (const side of ["left", "right", "top", "full"]) {
      expect(() => ObjectSettings.of(settings({ shape: "block", mediaSide: side }))).not.toThrow();
    }
  });

  it("refuse une forme inconnue en nommant la liste", () => {
    expect(() => ObjectSettings.of(settings({ shape: "triangle" }))).toThrow(
      /« triangle » n'est pas une forme de la vitrine : choisissez parmi card, kakemono/u,
    );
  });

  it("valide le défilement MÊME inactif : il sera réactivé sans être revérifié", () => {
    const tooFast = { ...CAROUSEL, intervalSeconds: 2 };
    expect(() => ObjectSettings.of(settings({ multiple: false, carousel: tooFast }))).toThrow(
      InvalidStorefrontError,
    );
    expect(() =>
      ObjectSettings.of(settings({ carousel: { ...CAROUSEL, firstSeconds: 31 } })),
    ).toThrow(/Le premier contenu s'affiche de 3 à 30 secondes/u);
    expect(() =>
      ObjectSettings.of(settings({ carousel: { ...CAROUSEL, sampleCount: 7 } })),
    ).toThrow(/L'aperçu simule de 2 à 6 contenus/u);
  });

  it("refuse une durée non entière", () => {
    expect(() =>
      ObjectSettings.of(settings({ carousel: { ...CAROUSEL, intervalSeconds: 4.5 } })),
    ).toThrow(/en nombre entier/u);
  });

  it("accepte un ton sur TOUTE forme, carte comprise — c'est le rendu qui l'ignore", () => {
    expect(ObjectSettings.of(settings({ shape: "card", tone: "dark" })).state.tone).toBe("dark");
  });

  it("refuse un ton hors des trois", () => {
    expect(() => ObjectSettings.of(settings({ tone: "pink" }))).toThrow(
      /« pink » n'est pas un ton de la vitrine : choisissez parmi light, dark, accent/u,
    );
  });
});
