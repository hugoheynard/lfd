import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { BankExportTooManyMandatesError } from "../errors/mandate-bank-export-errors.js";
import {
  MANDATE_ALREADY_ISSUED_CELL,
  MANDATE_MIGRATED_CELL,
  debitNatureCell,
  paymentSequenceCell,
  signatureDateCell,
} from "./mandate-bank-export-values.js";
import { SEPA_NAME_MAX, sepa, sepaText } from "./sepa-text.js";

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
 * Le nom du débiteur, colonne C : coupé à 70 par la même règle que le
 * `Dbtr/Nm` du `pain.008` (`sepaText`, `SEPA_NAME_MAX`). La banque accepte 140
 * ici (réponse 11), mais le prélèvement porte 70 : Hugo a tranché le
 * 2026-10-23 pour que le débiteur ait le même nom dans les deux fichiers.
 */
export const DEBTOR_NAME_MAX_LENGTH = SEPA_NAME_MAX;

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
 */
export function renderMandateBankCsv(rows: readonly MandateBankRow[]): string {
  if (rows.length > BANK_IMPORT_MAX_ROWS) {
    throw new BankExportTooManyMandatesError(rows.length, BANK_IMPORT_MAX_ROWS);
  }
  return rows.map((row) => line(cellsOf(row))).join("");
}

/** A à H, I et J vides, K et L, puis M à R vides. */
function cellsOf(row: MandateBankRow): readonly string[] {
  const filled = [
    row.reference,
    row.ics,
    sepaText(row.debtorName, DEBTOR_NAME_MAX_LENGTH),
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
