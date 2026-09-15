import { Bic } from "../../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../../accounting/domain/value-objects/legal-address.js";
import { InvalidDebtorAccountError } from "../../errors/mandate-errors.js";
import { DebtorAccount, type DebtorAccountInput } from "../debtor-account.js";

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
const IBAN = "FR1420041010050500013M02606";
/** Un second compte, valide et distinct du premier. */
const OTHER_IBAN = "DE89370400440532013000";

const ADDRESS = LegalAddress.create({
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
});

function account(over: Partial<DebtorAccountInput> = {}): DebtorAccount {
  return DebtorAccount.create({
    holder: "Refuge du Col SARL",
    holderLegalForm: "SARL",
    address: ADDRESS,
    iban: Iban.create(IBAN),
    bic: Bic.create("CEPAFRPP751"),
    ...over,
  });
}

describe("DebtorAccount", () => {
  it("recopie le RIB tel que la banque du client le connaît", () => {
    const debtor = account();
    expect(debtor.holder).toBe("Refuge du Col SARL");
    expect(debtor.iban.value).toBe(IBAN);
    expect(debtor.bic.value).toBe("CEPAFRPP751");
  });

  it("coupe les espaces autour du titulaire", () => {
    expect(account({ holder: "  Refuge du Col SARL  " }).holder).toBe("Refuge du Col SARL");
  });

  it("refuse un compte sans titulaire", () => {
    // Un compte incomplet ne se découvrirait qu'au rejet du lot, cinq jours
    // après l'envoi — donc en frais bancaires et en appel du client.
    expect(() => account({ holder: "   " })).toThrow(InvalidDebtorAccountError);
  });

  describe("holderLegalForm — la civilité ou forme juridique du titulaire", () => {
    it("coupe les espaces, et accepte le vide : c'est la frappe qui l'exige", () => {
      expect(account({ holderLegalForm: "  SAS  " }).holderLegalForm).toBe("SAS");
      expect(account({ holderLegalForm: "   " }).holderLegalForm).toBe("");
    });

    it("accepte 40 caractères, refuse le 41e — la case du mandat n'en tient pas plus", () => {
      expect(account({ holderLegalForm: "x".repeat(40) }).holderLegalForm).toHaveLength(40);
      expect(() => account({ holderLegalForm: "x".repeat(41) })).toThrow(InvalidDebtorAccountError);
    });

    it("se remplace sans toucher au reste du compte, et revalide", () => {
      const renamed = account().withHolderLegalForm(" Madame ");

      expect(renamed.holderLegalForm).toBe("Madame");
      expect(renamed.sameAccountAs(account())).toBe(true);
      expect(renamed.holder).toBe("Refuge du Col SARL");
      expect(() => account().withHolderLegalForm("x".repeat(41))).toThrow(
        InvalidDebtorAccountError,
      );
    });
  });

  it("ne laisse sortir que de quoi reconnaître le compte", () => {
    expect(account().last4()).toBe("2606");
  });

  it("ne fait jamais repartir l'IBAN dans le refus", () => {
    // Même règle que `InvalidIbanError` : le message d'une DomainError repart
    // au client. Le refus nomme le champ, jamais la valeur.
    let caught: unknown;
    try {
      account({ holder: "" });
    } catch (error) {
      caught = error;
    }
    expect((caught as InvalidDebtorAccountError).message).not.toContain(IBAN);
  });

  describe("sameAccountAs — l'inverse du créancier, et c'est le sujet", () => {
    it("compare l'IBAN, qui est imprimé sur le mandat signé", () => {
      expect(account().sameAccountAs(account())).toBe(true);
      expect(account().sameAccountAs(account({ iban: Iban.create(OTHER_IBAN) }))).toBe(false);
    });

    it("ignore le titulaire et l'adresse : un déménagement ne change pas le compte", () => {
      const movedAndRenamed = account({
        holder: "Refuge du Col SAS",
        address: LegalAddress.create({
          line1: "3 route de la Balme",
          line2: "Bâtiment B",
          postalCode: "73320",
          city: "Tignes",
          countryCode: "FR",
        }),
      });
      expect(account().sameAccountAs(movedAndRenamed)).toBe(true);
    });
  });
});
