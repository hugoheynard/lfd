import {
  AccountBankExportTooLargeError,
  AccountHolderTooLongError,
} from "../errors/account-bank-export-errors.js";
import { Iban } from "../value-objects/iban.js";
import {
  ABA_BSB_INS_CELL,
  ACCOUNT_FILE_HEADER,
  ACCOUNT_FORMAT_TYPE_CELL,
  ACCOUNT_HOLDER_MAX_LENGTH,
  ACCOUNT_IMPORT_MAX_ROWS,
  ADDRESS_LINE_4_CELL,
  BANK_IDENTIFIER_TYPE_CELL,
  LIST_NAME_CELL,
  TAX_IDENTIFIER_CELL,
  cityLineCell,
  ibanCells,
} from "./account-bank-export-values.js";
import { bankCell } from "./mandate-bank-export-csv.js";

/**
 * **Le fichier des comptes destinataires** pour le portail de la banque (doc
 * `prerequis-export-ribs.md` § 1).
 *
 * Le modèle (`modele-comptes-destinataires-2026.csv`) : 16 colonnes A à P,
 * `;` SÉPARATEUR sans `;` final (l'inverse du fichier des mandats), CRLF.
 * Chaque cellule passe par `bankCell` — le jeu SEPA de `sepa()`, donc de
 * l'ASCII, sous-ensemble du Latin-1 du modèle : il n'y a rien à encoder (R3).
 * Les valeurs non dites par la banque sont dans `account-bank-export-values.ts`.
 *
 * Déterministe : aucune horloge lue ici.
 */

/** Le nombre de colonnes du modèle, de A à P. */
export const ACCOUNT_FILE_COLUMN_COUNT = 16;

const CELL_SEPARATOR = ";";
const LINE_END = "\r\n";

/** Une ligne du fichier : un compte, tel que la banque doit le connaître. */
export interface AccountBankRow {
  /** Pour nommer le compte dans un refus — n'entre pas dans le fichier. */
  readonly companyName: string;
  /** B — le titulaire du RIB (R6). */
  readonly holder: string;
  /** C — vide s'il n'est pas connu (R4). */
  readonly siren: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  /** H — le pays de l'adresse (Q-B7). */
  readonly countryCode: string;
  /** En clair : ce fichier est la seule sortie qui le porte. */
  readonly iban: string;
  readonly bic: string;
}

/**
 * Le fichier entier : une ligne par compte, CRLF après chacune.
 *
 * @throws {AccountBankExportTooLargeError} plus de 200 lignes.
 * @throws {AccountHolderTooLongError} un titulaire au-delà de 140, nommé par sa société.
 * @throws {InvalidIbanError} un IBAN descellé qui ne se relit pas — une base abîmée.
 */
export function renderAccountBankCsv(rows: readonly AccountBankRow[]): string {
  if (rows.length > ACCOUNT_IMPORT_MAX_ROWS) {
    throw new AccountBankExportTooLargeError(rows.length, ACCOUNT_IMPORT_MAX_ROWS);
  }
  const tooLong = rows.filter((row) => bankCell(row.holder).length > ACCOUNT_HOLDER_MAX_LENGTH);
  if (tooLong.length > 0) {
    throw new AccountHolderTooLongError(
      tooLong.map((row) => row.companyName),
      ACCOUNT_HOLDER_MAX_LENGTH,
    );
  }
  const header = ACCOUNT_FILE_HEADER === null ? "" : `${ACCOUNT_FILE_HEADER}${LINE_END}`;
  return header + rows.map((row) => line(cellsOf(row))).join("");
}

/** A à P, dans l'ordre du modèle. */
function cellsOf(row: AccountBankRow): readonly string[] {
  const iban = ibanCells(Iban.create(row.iban).value);
  return [
    ACCOUNT_FORMAT_TYPE_CELL,
    row.holder,
    row.siren ?? "",
    row.addressLine1,
    row.addressLine2,
    cityLineCell(row.postalCode, row.city),
    ADDRESS_LINE_4_CELL,
    row.countryCode.toUpperCase(),
    iban.country,
    iban.key,
    iban.account,
    row.bic.toUpperCase(),
    LIST_NAME_CELL,
    BANK_IDENTIFIER_TYPE_CELL,
    ABA_BSB_INS_CELL,
    TAX_IDENTIFIER_CELL,
  ];
}

function line(cells: readonly string[]): string {
  return cells.map((cell) => bankCell(cell)).join(CELL_SEPARATOR) + LINE_END;
}
