import { CONTACT_CARD_DEFAULTS } from "../contact.values.js";

describe("CONTACT_CARD_DEFAULTS — les replis de la carte de contact", () => {
  it("porte titre et phrase dans les trois langues, pour les deux publics", () => {
    for (const card of [CONTACT_CARD_DEFAULTS.cards.b2b, CONTACT_CARD_DEFAULTS.cards.b2c]) {
      for (const text of [card.title, card.body]) {
        expect([text.fr, text.en, text.it].every((value) => value.trim() !== "")).toBe(true);
      }
    }
  });

  // Régression : ce numéro de repli s'affichait en production (retiré le 2026-10-26, Hugo).
  it("n'a PAS de numéro : aucun numéro réglé, aucun numéro affiché", () => {
    expect(CONTACT_CARD_DEFAULTS).not.toHaveProperty("phone");
  });

  it("n'a PAS de surtitre : sans surtitre réglé, la boutique n'en montre aucun", () => {
    expect(CONTACT_CARD_DEFAULTS.cards.b2b).not.toHaveProperty("kicker");
    expect(CONTACT_CARD_DEFAULTS.cards.b2c).not.toHaveProperty("kicker");
  });
});
