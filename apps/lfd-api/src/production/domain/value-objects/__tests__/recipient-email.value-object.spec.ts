import { InvalidRecipientEmailError } from "../../errors/dossier-recipient-errors.js";
import { emailKeyOf, RecipientEmail } from "../recipient-email.value-object.js";

describe("RecipientEmail — l'adresse d'un destinataire du dossier", () => {
  it("se normalise en minuscules, sans les blancs autour", () => {
    expect(RecipientEmail.of("  Jeanne.Roux@Fournil.FR ").value).toBe("jeanne.roux@fournil.fr");
  });

  it.each([["jeanne"], ["jeanne@fournil"], ["jeanne roux@fournil.fr"], ["@fournil.fr"], [""]])(
    "refuse « %s »",
    (raw) => {
      expect(() => RecipientEmail.of(raw)).toThrow(InvalidRecipientEmailError);
    },
  );

  it("refuse une adresse plus longue que la limite pratique", () => {
    expect(() => RecipientEmail.of(`${"a".repeat(250)}@x.fr`)).toThrow(InvalidRecipientEmailError);
  });

  it("compare une adresse de l'annuaire sans tenir compte de la casse", () => {
    expect(emailKeyOf(" Paul@X.fr")).toBe("paul@x.fr");
  });
});
