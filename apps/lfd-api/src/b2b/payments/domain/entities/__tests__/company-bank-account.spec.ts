import { Bic } from "../../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../../accounting/domain/value-objects/legal-address.js";
import { DebtorAccount } from "../../value-objects/debtor-account.js";
import { MandateOptions } from "../../value-objects/mandate-options.js";
import { CompanyBankAccount, type CompanyBankAccountSnapshot } from "../company-bank-account.js";

const IBAN = "FR1420041010050500013M02606";
const OTHER_IBAN = "DE89370400440532013000";

function address(line1 = "12 rue des Alpages", city = "Val d'Isère"): LegalAddress {
  return LegalAddress.create({
    line1,
    line2: "",
    postalCode: "73150",
    city,
    countryCode: "FR",
  });
}

function debtor(over: { holder?: string; iban?: string; line1?: string } = {}): DebtorAccount {
  return DebtorAccount.create({
    holder: over.holder ?? "Refuge du Col SARL",
    address: address(over.line1),
    iban: Iban.create(over.iban ?? IBAN),
    bic: Bic.create("CEPAFRPP751"),
  });
}

function declared(): CompanyBankAccount {
  return CompanyBankAccount.declare({
    id: "cba_1",
    companyId: "cmp_1",
    account: debtor(),
    options: MandateOptions.empty(),
  });
}

describe("CompanyBankAccount", () => {
  it("déclare le premier RIB d'un client", () => {
    const account = declared();
    expect(account.companyId).toBe("cmp_1");
    expect(account.account.iban.value).toBe(IBAN);
  });

  it("rend l'IBAN EN CLAIR à la persistance — c'est l'adaptateur qui scelle", () => {
    // Le domaine ne chiffre pas : un agrégat qui scellerait lui-même dépendrait
    // d'un port de chiffrement pour se tester.
    expect(declared().toPersistence().iban).toBe(IBAN);
  });

  it("recopie le bloc du RIB tel qu'il s'imprimera sur le mandat", () => {
    expect(declared().toPersistence()).toMatchObject({
      holder: "Refuge du Col SARL",
      addressLine1: "12 rue des Alpages",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
      bic: "CEPAFRPP751",
    });
  });

  describe("replaceWith — ce qui compte comme un changement de compte", () => {
    /**
     * 🔴 La règle qui justifie le booléen. Corriger une raison sociale ou
     * enregistrer un déménagement ne touche pas à ce que le débiteur a
     * autorisé — refaire signer un mandat pour une faute de frappe est le
     * meilleur moyen qu'un client cesse de signer.
     */
    it("ne signale AUCUN changement quand seuls le titulaire et l'adresse bougent", () => {
      const account = declared();
      const changed = account.replaceWith(
        debtor({ holder: "Refuge du Col SAS", line1: "3 route de la Balme" }),
      );
      expect(changed).toBe(false);
      // La correction est bien prise, elle n'est simplement pas un changement
      // de compte : c'est ce bloc-là qui s'imprime sur le mandat.
      expect(account.account.holder).toBe("Refuge du Col SAS");
    });

    it("signale un changement quand l'IBAN change", () => {
      const account = declared();
      expect(account.replaceWith(debtor({ iban: OTHER_IBAN }))).toBe(true);
      expect(account.account.iban.value).toBe(OTHER_IBAN);
    });

    it("ne signale rien quand on repose exactement le même RIB", () => {
      expect(declared().replaceWith(debtor())).toBe(false);
    });
  });

  describe("reconstitute — la ligne repasse par les value objects", () => {
    const row: CompanyBankAccountSnapshot = {
      id: "cba_1",
      companyId: "cmp_1",
      holder: "Refuge du Col SARL",
      addressLine1: "12 rue des Alpages",
      addressLine2: "",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
      iban: IBAN,
      bic: "CEPAFRPP751",
      debtorReference: "C-9P2X4B",
      contractNumber: "",
    };

    it("fait l'aller-retour sans rien perdre", () => {
      expect(CompanyBankAccount.reconstitute(row).toPersistence()).toEqual(row);
    });

    it("refuse une ligne dont l'IBAN a été corrigé à la main en SQL", () => {
      // Une ligne écrite par une main tierce est refusée à la RELECTURE plutôt
      // que promenée dans le domaine.
      expect(() =>
        CompanyBankAccount.reconstitute({ ...row, iban: "FR1420041010050500013M02607" }),
      ).toThrow();
    });

    it("refuse une ligne au titulaire vidé", () => {
      expect(() => CompanyBankAccount.reconstitute({ ...row, holder: "" })).toThrow();
    });
  });
});

describe("CompanyBankAccount — les zones facultatives du mandat", () => {
  it("part vide, ce qui est le cas ordinaire", () => {
    expect(declared().options.isEmpty).toBe(true);
  });

  it("se réécrit SANS toucher au compte", () => {
    // Corriger la description d'un contrat ne remet aucun mandat en cause,
    // alors que changer d'IBAN, si. Les confondre ferait refaire signer pour
    // une ligne de texte.
    const account = declared();
    account.setOptions(
      MandateOptions.create({
        debtorReference: "C-9P2X4B",
        contractNumber: "CT-42",
      }),
    );

    expect(account.account.iban.value).toBe(IBAN);
    expect(account.toPersistence().contractNumber).toBe("CT-42");
  });

  it("rogne les espaces plutôt que de les imprimer", () => {
    // Une espace de fin devant un pointillé décale le texte imprimé, et deux
    // valeurs qui n'en diffèrent que feraient croire à un changement.
    const options = MandateOptions.create({
      debtorReference: "  C-9P2X4B ",
      contractNumber: " ",
    });
    expect(options.debtorReference).toBe("C-9P2X4B");
    expect(options.contractNumber).toBe("");
  });
});
