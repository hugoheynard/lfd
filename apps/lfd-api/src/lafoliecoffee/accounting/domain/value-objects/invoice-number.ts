import { InvalidInvoiceNumberError } from "../errors/invoice-errors.js";
import { INVOICE_PREFIX_PATTERN } from "./invoice-prefix.js";

/** Le préfixe des factures ET des avoirs : une seule séquence (architecture, § 4.2). */
export const INVOICE_NUMBER_PREFIX = "FA";
export const INVOICE_SEQUENCE_DIGITS = 6;
export const INVOICE_SEQUENCE_MAX = 999_999;
const FIRST_YEAR = 2000;
const LAST_YEAR = 9999;

const PATTERN = /^FA-([A-Z]{2,6})-(\d{4})-(\d{6})$/u;
const SHAPE = "FA-<préfixe>-AAAA-NNNNNN attendue";

/**
 * **Le numéro d'une facture** — `FA-<préfixe de l'entité>-<année>-<n° sur 6
 * chiffres>`, par exemple `FA-LFD-2026-000123` (plan `plan-zero-faille.md`,
 * F14, lot ZA ; la base tient la même forme, `invoice_number_shape`).
 *
 * Le préfixe nomme l'entité émettrice : le compteur est par entité et par
 * année, et sans lui deux entités imprimeraient deux suites au même format.
 * Au plus 21 caractères, des lettres, des chiffres et `-` : BR-FR-01 et
 * BR-FR-02 (35 caractères, alphanumérique et `+ - _ /`) sont tenus par
 * construction.
 *
 * Les avoirs (381) prennent leur numéro dans la MÊME séquence : deux séquences
 * feraient deux suites à justifier. L'attribuer est le travail de la base
 * (E2) ; ce value object ne fait que refuser une forme fausse. Le n° 0
 * n'existe pas : une séquence commence à 1.
 */
export class InvoiceNumber {
  private constructor(
    readonly prefix: string,
    readonly year: number,
    readonly sequence: number,
  ) {}

  /** @throws {InvalidInvoiceNumberError} le préfixe, l'année ou le rang est hors bornes. */
  static compose(prefix: string, year: number, sequence: number): InvoiceNumber {
    const raw = `${INVOICE_NUMBER_PREFIX}-${prefix}-${String(year)}-${String(sequence)}`;
    if (!INVOICE_PREFIX_PATTERN.test(prefix)) {
      throw new InvalidInvoiceNumberError(raw, "préfixe de 2 à 6 lettres majuscules attendu");
    }
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
      throw new InvalidInvoiceNumberError(raw, "année sur quatre chiffres attendue");
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > INVOICE_SEQUENCE_MAX) {
      throw new InvalidInvoiceNumberError(
        raw,
        `rang entre 1 et ${String(INVOICE_SEQUENCE_MAX)} attendu`,
      );
    }
    return new InvoiceNumber(prefix, year, sequence);
  }

  /** Relit un numéro imprimé. @throws {InvalidInvoiceNumberError} */
  static parse(raw: string): InvoiceNumber {
    const match = PATTERN.exec(raw.trim());
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      throw new InvalidInvoiceNumberError(raw, `forme ${SHAPE}`);
    }
    return InvoiceNumber.compose(match[1], Number(match[2]), Number(match[3]));
  }

  get value(): string {
    const rank = String(this.sequence).padStart(INVOICE_SEQUENCE_DIGITS, "0");
    return `${INVOICE_NUMBER_PREFIX}-${this.prefix}-${String(this.year)}-${rank}`;
  }

  equals(other: InvoiceNumber): boolean {
    return (
      this.prefix === other.prefix && this.year === other.year && this.sequence === other.sequence
    );
  }
}
