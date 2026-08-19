import { mirrorWindow, variationBp, windowDays } from "../comparison.js";

/**
 * **L'arithmétique de l'écart**, et les deux cas où elle refuse de répondre.
 *
 * Une variation depuis zéro n'est pas une variation, c'est une apparition — et
 * afficher « +∞ % » sur une nouveauté est un chiffre spectaculaire qui ne dit
 * rien de ce qu'on a décidé.
 */

const day = (iso: string): Date => new Date(`2026-08-${iso}T00:00:00.000Z`);

describe("la variation", () => {
  it("dit une baisse en points de base", () => {
    expect(variationBp(200, 170)).toBe(-1_500);
  });

  it("dit une hausse", () => {
    expect(variationBp(200, 220)).toBe(1_000);
  });

  it("rend zéro quand rien n'a bougé", () => {
    expect(variationBp(200, 200)).toBe(0);
  });

  /** Partir de rien n'est pas une variation : c'est une apparition. */
  it("se tait quand le point de départ est nul", () => {
    expect(variationBp(0, 120)).toBeNull();
  });

  it("dit la disparition complète", () => {
    expect(variationBp(120, 0)).toBe(-10_000);
  });
});

describe("la fenêtre miroir", () => {
  /**
   * Même durée, et ce n'est pas une élégance : comparer trente jours à
   * quatre-vingt-dix ferait passer une saison pour un effet.
   */
  it("a la même durée que la fenêtre observée, et la précède", () => {
    const mirror = mirrorWindow(day("10"), day("20"));

    expect(mirror.to).toEqual(day("10"));
    // Dix jours en arrière depuis le 10 août : le 31 juillet, pas le 1er.
    expect(mirror.from).toEqual(new Date("2026-07-31T00:00:00.000Z"));
  });

  it("compte les jours de la fenêtre observée", () => {
    expect(windowDays(day("10"), day("20"))).toBe(10);
  });

  /** Une fenêtre plus courte qu'un jour en vaut un : zéro ne se divise pas. */
  it("ne descend jamais sous un jour", () => {
    expect(windowDays(day("10"), new Date("2026-08-10T06:00:00.000Z"))).toBe(1);
  });
});
