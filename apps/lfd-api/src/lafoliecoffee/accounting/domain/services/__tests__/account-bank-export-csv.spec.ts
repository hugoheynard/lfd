import { InvalidIbanError } from "../../errors/accounting-errors.js";
import {
  AccountBankExportTooLargeError,
  AccountHolderTooLongError,
} from "../../errors/account-bank-export-errors.js";
import {
  ACCOUNT_FILE_COLUMN_COUNT,
  renderAccountBankCsv,
  type AccountBankRow,
} from "../account-bank-export-csv.js";
import {
  ACCOUNT_HOLDER_MAX_LENGTH,
  ACCOUNT_IMPORT_MAX_ROWS,
} from "../account-bank-export-values.js";
import { IBAN_A, IBAN_B } from "./account-for-bank-export.fixture.js";

function row(over: Partial<AccountBankRow> = {}): AccountBankRow {
  return {
    companyName: "Café de l'Isère",
    holder: "Café de l'Isère",
    siren: "552100554",
    addressLine1: "12 bis, rue X & Y",
    addressLine2: "",
    postalCode: "73150",
    city: "Val d'Isère",
    countryCode: "fr",
    iban: IBAN_A,
    bic: "bnpafrppxxx",
    ...over,
  };
}

describe("le fichier des comptes destinataires (§ 1)", () => {
  it("rend les 16 colonnes du modèle, `;` séparateur sans `;` final, CRLF, sans en-tête", () => {
    expect(renderAccountBankCsv([row()])).toBe(
      "I;Cafe de l'Isere;552100554;12 bis, rue X Y;;73150 Val d'Isere;;FR;FR;76;30004000031234567890143;BNPAFRPPXXX;;;;\r\n",
    );
  });

  it("découpe l'IBAN en pays, clé et BBAN (I, J, K)", () => {
    const cells = renderAccountBankCsv([row({ iban: "fr14 2004 1010 0505 0001 3m02 606" })])
      .replace("\r\n", "")
      .split(";");
    expect(cells).toHaveLength(ACCOUNT_FILE_COLUMN_COUNT);
    expect(cells.slice(8, 11)).toEqual(["FR", "14", "20041010050500013M02606"]);
  });

  it("laisse C vide quand le SIREN n'est pas connu", () => {
    const cells = renderAccountBankCsv([row({ siren: null })]).split(";");
    expect(cells[2]).toBe("");
  });

  it("une ligne par compte, chacune terminée par CRLF", () => {
    const file = renderAccountBankCsv([row(), row({ iban: IBAN_B })]);
    expect(file.split("\r\n")).toHaveLength(3);
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("n'écrit que de l'ASCII et neutralise un début de formule", () => {
    const file = renderAccountBankCsv([row({ holder: "=HYPERLINK(œuvre)", addressLine1: "€ ;x" })]);
    expect(/^[\x20-\x7e\r\n]*$/u.test(file)).toBe(true);
    expect(file.split(";")[1]).toBe("HYPERLINK( uvre)");
  });

  it("refuse un titulaire au-delà de 140 caractères, en nommant la société", () => {
    const holder = "A".repeat(ACCOUNT_HOLDER_MAX_LENGTH + 1);
    expect(() => renderAccountBankCsv([row({ holder, companyName: "Trop Long" })])).toThrow(
      AccountHolderTooLongError,
    );
    expect(() => renderAccountBankCsv([row({ holder: "A".repeat(140) })])).not.toThrow();
  });

  it("refuse plus de 200 lignes", () => {
    const rows = Array.from({ length: ACCOUNT_IMPORT_MAX_ROWS + 1 }, () => row());
    expect(() => renderAccountBankCsv(rows)).toThrow(AccountBankExportTooLargeError);
  });

  it("refuse un IBAN descellé qui ne se relit pas", () => {
    expect(() => renderAccountBankCsv([row({ iban: "FR7630004000031234567890144" })])).toThrow(
      InvalidIbanError,
    );
  });
});
