import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import {
  BankExportDebtorNameTooLongError,
  BankExportTooManyMandatesError,
} from "../errors/mandate-bank-export-errors.js";
import {
  MANDATE_ALREADY_ISSUED_CELL,
  MANDATE_MIGRATED_CELL,
  debitNatureCell,
  paymentSequenceCell,
  signatureDateCell,
} from "./mandate-bank-export-values.js";
import { sepa } from "./pain008-document.js";

/**
 * **Le fichier d'import des mandats** pour le portail de la banque (plan
 * `export-des-mandats-pour-la-banque.md`).
 *
 * Le modèle (`modele-import-mandats-cenet-remises.xlsx`) : ASCII, `;`
 * séparateur ET terminateur de chaque cellule, fin de ligne CRLF, 18 colonnes
 * dont A à H, K et L obligatoires, et **sans ligne d'en-tête** — « enregistrer
 * en CSV sans la ligne d'en-tête » dit la feuille. 200 lignes au plus.
 *
 * Déterministe : aucune horloge lue ici.
 */

/** Le nombre de colonnes du modèle, de A à R. */
export const BANK_IMPORT_COLUMN_COUNT = 18;

/**
 * Le nom du débiteur, colonne C : 140 caractères au plus (réponse 11 de la
 * banque). Au-delà, la ligne est REFUSÉE, jamais coupée : un nom tronqué en
 * silence est un débiteur que la banque connaît sous un autre nom que le
 * `pain.008`, qui l'écrit entier.
 */
export const DEBTOR_NAME_MAX_LENGTH = 140;

/** Lignes par fichier d'import (réponse 12 de la banque). */
export const BANK_IMPORT_MAX_ROWS = 200;

const CELL_TERMINATOR = ";";
const LINE_END = "\r\n";

/**
 * Ce qu'un tableur lit comme le début d'une formule. `sepa()` laisse passer
 * `+` et `-`, qui sont dans le jeu SEPA : il faut donc les retirer APRÈS — avec
 * les espaces qui les séparent, sans quoi « - -x » laisserait « -x ».
 */
const FORMULA_LEAD = /^[\s+\-=@]+/u;

/** Une ligne du fichier : un mandat, tel que la banque doit le connaître. */
export interface MandateBankRow {
  /** A — la RUM. */
  readonly reference: string;
  /** B — l'ICS de l'entité émettrice. */
  readonly ics: string;
  /** C — le nom du débiteur, le même que le `Dbtr/Nm` du `pain.008`. */
  readonly debtorName: string;
  /** D — en clair : ce fichier est la seule sortie qui le porte. */
  readonly iban: string;
  readonly bic: string;
  readonly signedAt: Date;
  readonly paymentType: MandatePaymentType;
  readonly scheme: SepaScheme;
}

/**
 * Le fichier entier : une ligne par mandat, CRLF après chacune, rien d'autre.
 *
 * @throws {BankExportTooManyMandatesError} plus de 200 lignes.
 * @throws {BankExportDebtorNameTooLongError} un nom au-delà de 140, nommé par
 *   la RUM de chaque mandat en cause.
 */
export function renderMandateBankCsv(rows: readonly MandateBankRow[]): string {
  if (rows.length > BANK_IMPORT_MAX_ROWS) {
    throw new BankExportTooManyMandatesError(rows.length, BANK_IMPORT_MAX_ROWS);
  }
  const tooLong = rows.filter((row) => bankCell(row.debtorName).length > DEBTOR_NAME_MAX_LENGTH);
  if (tooLong.length > 0) {
    throw new BankExportDebtorNameTooLongError(
      tooLong.map((row) => row.reference),
      DEBTOR_NAME_MAX_LENGTH,
    );
  }
  return rows.map((row) => line(cellsOf(row))).join("");
}

/** A à H, I et J vides, K et L, puis M à R vides. */
function cellsOf(row: MandateBankRow): readonly string[] {
  const filled = [
    row.reference,
    row.ics,
    row.debtorName,
    row.iban,
    row.bic,
    signatureDateCell(row.signedAt),
    paymentSequenceCell(row.paymentType),
    debitNatureCell(row.scheme),
    "",
    "",
    MANDATE_ALREADY_ISSUED_CELL,
    MANDATE_MIGRATED_CELL,
  ];
  const empty = Array.from({ length: BANK_IMPORT_COLUMN_COUNT - filled.length }, () => "");
  return [...filled, ...empty];
}

function line(cells: readonly string[]): string {
  return cells.map((cell) => `${bankCell(cell)}${CELL_TERMINATOR}`).join("") + LINE_END;
}

/**
 * Une cellule sûre : le jeu SEPA (`sepa()`, le seul translittérateur ASCII du
 * dépôt — il retire aussi `;` et `"`, qui casseraient la ligne), puis sans
 * caractère de formule en tête. La RUM et l'ICS y passent aussi : rien de ce
 * qui entre dans ce fichier n'est cru sur parole.
 */
export function bankCell(raw: string): string {
  return sepa(raw).replace(FORMULA_LEAD, "").trimEnd();
}
