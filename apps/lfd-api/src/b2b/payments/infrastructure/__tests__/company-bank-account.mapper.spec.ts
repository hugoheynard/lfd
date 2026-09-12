import { randomBytes } from "node:crypto";

import { Bic } from "../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import { AesGcmFieldCipher } from "../../../../platform/crypto/aes-gcm-field-cipher.js";
import type { CompanyBankAccount as CompanyBankAccountRow } from "../../../../platform/database/client/client.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import { DebtorAccount } from "../../domain/value-objects/debtor-account.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";
import { toColumns, toDomain } from "../company-bank-account.mapper.js";

const IBAN = "FR1420041010050500013M02606";

/** Le VRAI chiffrement, pas un double : c'est lui qu'on éprouve ici. */
const cipher = new AesGcmFieldCipher(randomBytes(32));

function aggregate(): CompanyBankAccount {
  return CompanyBankAccount.declare({
    id: "cba_1",
    companyId: "cmp_1",
    account: DebtorAccount.create({
      holder: "Refuge du Col SARL",
      address: LegalAddress.create({
        line1: "12 rue des Alpages",
        line2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
      }),
      iban: Iban.create(IBAN),
      bic: Bic.create("CEPAFRPP751"),
    }),
    options: MandateOptions.create({
      debtorReference: "C-9P2X4B",
      contractNumber: "CT-42",
      contractDescription: "Fourniture de café",
    }),
  });
}

/** Une ligne telle que Postgres la rendrait, scellée par le même coffre. */
function row(over: Partial<CompanyBankAccountRow> = {}): CompanyBankAccountRow {
  const columns = toColumns(aggregate().toPersistence(), cipher);
  return {
    id: "cba_1",
    companyId: "cmp_1",
    ...columns,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("company-bank-account.mapper", () => {
  describe("toColumns — le seul endroit qui scelle", () => {
    /**
     * 🔴 Le test qui justifie la colonne. Si l'IBAN apparaît en clair dans ce
     * que l'écriture pose, le coffre ne sert à rien — et personne ne s'en
     * apercevrait, puisque la relecture marcherait quand même.
     */
    it("ne laisse l'IBAN nulle part en clair dans les colonnes", () => {
      const columns = toColumns(aggregate().toPersistence(), cipher);
      expect(JSON.stringify(columns)).not.toContain(IBAN);
      // Ni le corps du compte sans sa clé de contrôle.
      expect(JSON.stringify(columns)).not.toContain("20041010050500013M0260");
    });

    it("scelle sous une forme que le coffre rouvre", () => {
      const columns = toColumns(aggregate().toPersistence(), cipher);
      expect(cipher.open(columns.ibanSealed)).toBe(IBAN);
    });

    it("DÉRIVE les quatre derniers du clair, il ne les reçoit pas", () => {
      // Un `last4` fourni pourrait diverger de l'IBAN qu'il prétend résumer —
      // et c'est lui qu'une zone de danger fait taper pour confirmer.
      expect(toColumns(aggregate().toPersistence(), cipher).ibanLast4).toBe("2606");
    });

    it("ne scelle PAS le BIC : il désigne un établissement, pas un compte", () => {
      expect(toColumns(aggregate().toPersistence(), cipher).bic).toBe("CEPAFRPP751");
    });

    it("ne scelle PAS les zones facultatives : elles ne désignent aucun compte", () => {
      const columns = toColumns(aggregate().toPersistence(), cipher);
      expect(columns.debtorReference).toBe("C-9P2X4B");
      expect(columns.contractNumber).toBe("CT-42");
      expect(columns.contractDescription).toBe("Fourniture de café");
    });

    it("scelle différemment deux fois la même valeur", () => {
      const snapshot = aggregate().toPersistence();
      expect(toColumns(snapshot, cipher).ibanSealed).not.toBe(
        toColumns(snapshot, cipher).ibanSealed,
      );
    });
  });

  describe("toDomain — l'ouverture du scellé", () => {
    it("rend l'agrégat avec son IBAN d'origine", () => {
      expect(toDomain(row(), cipher).account.iban.value).toBe(IBAN);
    });

    it("fait l'aller-retour complet sans rien perdre", () => {
      expect(toDomain(row(), cipher).toPersistence()).toEqual(aggregate().toPersistence());
    });

    it("échoue plutôt que de rendre un compte faux quand la clé a changé", () => {
      // Une rotation de clé DOIT casser bruyamment : ouvrir à moitié rendrait
      // un IBAN qu'on prélèverait.
      const otherVault = new AesGcmFieldCipher(randomBytes(32));
      expect(() => toDomain(row(), otherVault)).toThrow(/autre clé/u);
    });

    it("refuse une ligne dont le BIC a été corrigé à la main en SQL", () => {
      // Trop court : `Bic` attend 8 ou 11 caractères. Attention au piège —
      // « PAS-UN-BIC » est ACCEPTÉ, les tirets étant retirés à la
      // normalisation, ce qui laisse `PASUNBIC`, huit lettres parfaitement
      // conformes. Un contre-exemple mal choisi ne prouve rien.
      expect(() => toDomain(row({ bic: "CEPA" }), cipher)).toThrow();
    });

    it("refuse une ligne au titulaire vidé", () => {
      expect(() => toDomain(row({ holder: "" }), cipher)).toThrow();
    });
  });
});
