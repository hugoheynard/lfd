import { Bic } from "../bic.js";
import { CreditorAccount } from "../creditor-account.js";
import { Iban } from "../iban.js";
import { LegalAddress } from "../legal-address.js";
import { InvalidLegalEntityError } from "../../errors/accounting-errors.js";

const IBAN = Iban.create("FR1420041010050500013M02606");
const OTHER_IBAN = Iban.create("FR7630006000011234567890189");
const BIC = Bic.create("CEPAFRPP751");

function address(over: Partial<{ line1: string; city: string }> = {}): LegalAddress {
  return LegalAddress.create({
    line1: over.line1 ?? "Route de la Balme",
    line2: "",
    postalCode: "73150",
    city: over.city ?? "Val d'Isère",
    countryCode: "FR",
  });
}

function account(over: Partial<{ holder: string; city: string; iban: Iban }> = {}) {
  return CreditorAccount.create({
    holder: over.holder ?? "Crazeativity",
    address: address({ city: over.city ?? "Val d'Isère" }),
    iban: over.iban ?? IBAN,
    bic: BIC,
  });
}

describe("CreditorAccount — la recopie du RIB", () => {
  it("garde le titulaire et l'adresse, pas seulement les coordonnées", () => {
    const rib = account();

    expect(rib.holder).toBe("Crazeativity");
    expect(rib.address.city).toBe("Val d'Isère");
    expect(rib.last4()).toBe("2606");
  });

  it("élague le titulaire — un RIB se recopie à la main, avec ses espaces", () => {
    expect(account({ holder: "  Crazeativity  " }).holder).toBe("Crazeativity");
  });

  /**
   * L'objet n'existe pas à moitié : c'est sa raison d'être. Un compte sans
   * titulaire ne se découvrirait qu'au rejet du lot, cinq jours après l'envoi.
   */
  it("REFUSE un compte sans titulaire, en disant à quoi il sert", () => {
    expect(() => account({ holder: "   " })).toThrow(InvalidLegalEntityError);
    expect(() => account({ holder: "" })).toThrow(/oppose au débiteur/u);
  });
});

/**
 * 🔴 Le cœur de la règle de gel : ce qu'un mandat IMPRIME, contre ce qu'il
 * n'imprime pas. Un mandat SEPA porte le titulaire, son adresse et l'ICS — il ne
 * porte pas l'IBAN du créancier.
 */
describe("CreditorAccount — ce que le papier porte", () => {
  it("deux comptes au même nom et à la même adresse sont le même créancier", () => {
    expect(account().sameIdentityAs(account())).toBe(true);
  });

  it("… même si l'IBAN diffère : changer de banque ne change pas le créancier", () => {
    expect(account().sameIdentityAs(account({ iban: OTHER_IBAN }))).toBe(true);
  });

  it("un titulaire différent est un AUTRE créancier", () => {
    expect(account().sameIdentityAs(account({ holder: "Autre Société" }))).toBe(false);
  });

  it("une adresse différente aussi — elle est imprimée à côté du nom", () => {
    expect(account().sameIdentityAs(account({ city: "Tignes" }))).toBe(false);
  });
});
