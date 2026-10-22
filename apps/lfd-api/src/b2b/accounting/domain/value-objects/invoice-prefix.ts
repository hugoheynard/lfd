import { InvalidInvoicePrefixError } from "../errors/invoice-errors.js";

/** 2 à 6 lettres majuscules non accentuées (Q-M3, Hugo, 2026-10-22). */
export const INVOICE_PREFIX_PATTERN = /^[A-Z]{2,6}$/u;
export const INVOICE_PREFIX_MIN_LENGTH = 2;
export const INVOICE_PREFIX_MAX_LENGTH = 6;

/**
 * **Le préfixe de numéro d'une entité émettrice** — le `LFD` de
 * `FA-LFD-2026-000001` (plan `plan-zero-faille.md`, F14, lot ZA).
 *
 * Il fait de chaque séquence une suite qui se nomme : deux entités, deux
 * préfixes, deux suites qu'aucune lecture ne confond. Unique entre entités
 * (en base), et figé dès la première pièce émise (agrégat ET base).
 *
 * Des lettres seulement : BR-FR-02 n'admet dans BT-1 que l'alphanumérique et
 * `+ - _ /` ; des chiffres se liraient comme une année ou un rang.
 */
export class InvoicePrefix {
  private constructor(readonly value: string) {}

  /**
   * Saisi en minuscules, il est relu en majuscules : la casse n'est pas un
   * choix qu'on demande à la personne.
   *
   * @throws {InvalidInvoicePrefixError} autre chose que 2 à 6 lettres.
   */
  static create(raw: string): InvoicePrefix {
    const value = raw.trim().toUpperCase();
    if (!INVOICE_PREFIX_PATTERN.test(value)) {
      throw new InvalidInvoicePrefixError(raw);
    }
    return new InvoicePrefix(value);
  }

  equals(other: InvoicePrefix): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
