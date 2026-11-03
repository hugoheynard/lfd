import { windowRequesterOf } from "../delivery-window.js";

/**
 * Qui demande la fenêtre d'une passation ou d'une révision (`delivery-window.ts`).
 */
describe("windowRequesterOf", () => {
  /**
   * Régression : la saisie de l'équipe pour un pro rendait `staff`, libre de
   * l'heure — un endroit pour échapper aux règles de livraison (E1, Hugo,
   * 2026-11-03). Elle demande désormais la fenêtre comme le pro.
   */
  it("rend « pro » quand l'équipe saisit ou révise pour une société", () => {
    expect(windowRequesterOf("c1", true)).toBe("pro");
  });

  it("rend « pro » quand le pro commande ou révise lui-même", () => {
    expect(windowRequesterOf("c1", false)).toBe("pro");
  });

  it("laisse le particulier libre de l'heure", () => {
    expect(windowRequesterOf(null, false)).toBe("individual");
  });

  it("laisse l'équipe libre de l'heure sur une commande sans société", () => {
    expect(windowRequesterOf(null, true)).toBe("staff");
  });
});
