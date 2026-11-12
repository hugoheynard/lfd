import { PIM_EVENTS } from "../../../../../journal/pim-journal.js";
import { signatureStillHolds } from "../readiness-renewal.js";

/** Comparé à rien : la règle ne lit que l'auteur et les types de faits. */
const SIGNED = { readyAt: new Date(0), readyBy: "staff_hugo" };

/**
 * Régression : redéclarer une fiche déjà signée retraçait le fait et resignait
 * `readyAt` sans que rien ait changé.
 */
describe("signatureStillHolds", () => {
  it("tient quand le même signataire n'a vu aucun fait de contenu", () => {
    expect(signatureStillHolds(SIGNED, "staff_hugo", [PIM_EVENTS.productDeclaredReady])).toBe(true);
  });

  it("ne tient pas sans signature", () => {
    expect(signatureStillHolds(null, "staff_hugo", [])).toBe(false);
  });

  it("ne tient pas pour un autre signataire", () => {
    expect(signatureStillHolds(SIGNED, "staff_autre", [])).toBe(false);
  });

  it("ne tient pas après un fait de contenu", () => {
    expect(signatureStillHolds(SIGNED, "staff_hugo", [PIM_EVENTS.productPricingSaved])).toBe(false);
  });
});
