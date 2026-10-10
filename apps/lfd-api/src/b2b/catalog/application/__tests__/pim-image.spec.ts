import { pimImageOf } from "../pim-image.js";

const BASE = { url: "https://m.test/c.jpg", alt: "Un croissant", width: 800, height: 600 };

/**
 * L4 (2026-10-10) : l'ingestion, la comparaison d'une arrivée et la projection
 * traduisent toutes trois le visuel du fil par ici. Un point focal ABSENT doit
 * se lire `null` partout, sinon le premier push après le déploiement
 * signalerait un changement sur toutes les fiches.
 */
describe("pimImageOf — le visuel du fil, rangé par le commerce", () => {
  it("garde le point focal posé", () => {
    expect(pimImageOf({ ...BASE, focal: { x: 0.1, y: 0.9 } })).toEqual({
      ...BASE,
      focal: { x: 0.1, y: 0.9 },
    });
  });

  it("lit un point focal ABSENT comme « au centre » (envoi d'avant)", () => {
    expect(pimImageOf(BASE)).toEqual({ ...BASE, focal: null });
  });

  it("lit un point focal nul comme tel", () => {
    expect(pimImageOf({ ...BASE, focal: null })?.focal).toBeNull();
  });

  it.each([null, undefined])("rend null pour un visuel %p", (media) => {
    expect(pimImageOf(media)).toBeNull();
  });
});
