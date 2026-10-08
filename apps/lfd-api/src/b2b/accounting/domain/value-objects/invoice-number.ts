import { InvalidInvoiceNumberError } from "../errors/invoice-errors.js";

/** Le préfixe des factures ET des avoirs : une seule séquence (architecture, § 4.2). */
export const INVOICE_NUMBER_PREFIX = "FA";
export const INVOICE_SEQUENCE_DIGITS = 6;
export const INVOICE_SEQUENCE_MAX = 999_999;
const FIRST_YEAR = 2000;
const LAST_YEAR = 9999;

const PATTERN = /^FA-(\d{4})-(\d{6})$/u;

/**
 * **Le numéro d'une facture** — `FA-<année>-<n° sur 6 chiffres>`, par exemple
 * `FA-2026-000123` (`documentation/b2b/architecture-facturation.md`, § 4.2).
 *
 * Les avoirs (381) prennent leur numéro dans la MÊME séquence : deux séquences
 * feraient deux suites à justifier. Le compteur est par entité et par année
 * (plan, § 5) ; l'attribuer est le travail de la base (E2), ce value object ne
 * fait que refuser une forme fausse. Le n° 0 n'existe pas : une séquence
 * commence à 1.
 */
export class InvoiceNumber {
  private constructor(
    readonly year: number,
    readonly sequence: number,
  ) {}

  /** @throws {InvalidInvoiceNumberError} l'année ou le rang est hors bornes. */
  static compose(year: number, sequence: number): InvoiceNumber {
    const raw = `${INVOICE_NUMBER_PREFIX}-${String(year)}-${String(sequence)}`;
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) {
      throw new InvalidInvoiceNumberError(raw, "année sur quatre chiffres attendue");
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > INVOICE_SEQUENCE_MAX) {
      throw new InvalidInvoiceNumberError(
        raw,
        `rang entre 1 et ${String(INVOICE_SEQUENCE_MAX)} attendu`,
      );
    }
    return new InvoiceNumber(year, sequence);
  }

  /** Relit un numéro imprimé. @throws {InvalidInvoiceNumberError} */
  static parse(raw: string): InvoiceNumber {
    const match = PATTERN.exec(raw.trim());
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new InvalidInvoiceNumberError(raw, "forme FA-AAAA-NNNNNN attendue");
    }
    return InvoiceNumber.compose(Number(match[1]), Number(match[2]));
  }

  get value(): string {
    const rank = String(this.sequence).padStart(INVOICE_SEQUENCE_DIGITS, "0");
    return `${INVOICE_NUMBER_PREFIX}-${String(this.year)}-${rank}`;
  }

  equals(other: InvoiceNumber): boolean {
    return this.year === other.year && this.sequence === other.sequence;
  }
}
