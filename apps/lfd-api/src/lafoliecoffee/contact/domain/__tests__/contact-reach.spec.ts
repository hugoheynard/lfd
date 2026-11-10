import { DEFAULT_CONTACT_SETTINGS, type ContactCardText } from "@lfd/contracts";

import { assertCardsReachable, type ReachPhone } from "../contact-reach.js";
import { ContactCardUnreachableError } from "../errors/contact-errors.js";

const b2c = (card: Partial<ContactCardText>) => ({
  ...DEFAULT_CONTACT_SETTINGS.cards,
  b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, ...card },
});
const NO_FORM = { showPhone: true, showForm: false };
const phone = (audience: ReachPhone["audience"], active = true): ReachPhone => ({
  audience,
  active,
});

describe("assertCardsReachable — chaque carte offre un geste (Hugo, 2026-10-26)", () => {
  it("refuse une carte qui affiche le numéro sans en avoir, formulaire coupé, sans message", () => {
    expect(() => assertCardsReachable(b2c(NO_FORM), [])).toThrow(ContactCardUnreachableError);
    expect(() => assertCardsReachable(b2c(NO_FORM), [])).toThrow(
      /Carte particuliers.*Ajoutez un numéro, réaffichez le formulaire ou écrivez un message/u,
    );
  });

  it("un numéro de l'autre clientèle, ou inactif, ne compte pas", () => {
    expect(() => assertCardsReachable(b2c(NO_FORM), [phone("b2b"), phone("b2c", false)])).toThrow(
      ContactCardUnreachableError,
    );
  });

  it("un numéro de sa clientèle, ou `both`, suffit", () => {
    expect(() => assertCardsReachable(b2c(NO_FORM), [phone("b2c")])).not.toThrow();
    expect(() => assertCardsReachable(b2c(NO_FORM), [phone("both")])).not.toThrow();
  });

  it("le formulaire, ou un message, suffit sans numéro", () => {
    expect(() => assertCardsReachable(DEFAULT_CONTACT_SETTINGS.cards, [])).not.toThrow();
    const said = { ...NO_FORM, noContactMessage: { fr: "Bientôt", en: "", it: "" } };
    expect(() => assertCardsReachable(b2c(said), [])).not.toThrow();
  });
});
