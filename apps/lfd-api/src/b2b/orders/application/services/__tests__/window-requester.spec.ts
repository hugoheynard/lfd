import { REGISTERED_BUYER } from "../../../domain/value-objects/order-buyer-kind.js";
import { windowRequesterOf } from "../order-drafting.service.js";

const PARTIES = { placedByUserId: "u1", buyerKind: REGISTERED_BUYER } as const;

/**
 * Qui demande la fenêtre d'une passation (`delivery-window.ts`).
 */
describe("windowRequesterOf", () => {
  /**
   * Régression : la saisie de l'équipe pour un pro rendait `staff`, libre de
   * l'heure — un endroit pour échapper aux règles de livraison (E1, Hugo,
   * 2026-11-03). Elle demande désormais la fenêtre comme le pro.
   */
  it("rend « pro » quand l'équipe saisit pour une société", () => {
    expect(windowRequesterOf({ ...PARTIES, companyId: "c1", placedByStaffId: "s1" })).toBe("pro");
  });

  it("rend « pro » quand le pro commande lui-même", () => {
    expect(windowRequesterOf({ ...PARTIES, companyId: "c1", placedByStaffId: null })).toBe("pro");
  });

  it("laisse le particulier libre de l'heure", () => {
    expect(windowRequesterOf({ ...PARTIES, companyId: null, placedByStaffId: null })).toBe(
      "individual",
    );
  });
});
