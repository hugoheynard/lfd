import type { InvoiceVatBreakdown, InvoiceVatCategory } from "@lfd/money";

import {
  CreditNoteExceedsInvoiceError,
  InvalidInvoiceError,
  InvoiceTotalsMismatchError,
} from "../errors/invoice-errors.js";
import { InvoiceQuantity } from "../value-objects/invoice-quantity.js";
import type { InvoiceLineInput, InvoicePaymentMeans } from "./invoice.types.js";

/**
 * Les invariants de la facture, purs — appelés par les factories de
 * `Invoice`. Coupés de l'entité pour qu'elle reste lisible ; aucun autre
 * appelant (vérifié le 2026-10-08).
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const FEBRUARY = 2;
const LEAP_FEBRUARY_DAYS = 29;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** `AAAA-MM-JJ`, un jour qui existe. @throws {InvalidInvoiceError} */
export function assertCalendarDate(field: string, value: string): void {
  const match = DATE_PATTERN.exec(value);
  const [year, month, day] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
  if (match === null || month < 1 || month > DAYS_IN_MONTH.length || day < 1) {
    throw new InvalidInvoiceError(field, `date AAAA-MM-JJ attendue, reçu « ${value} »`);
  }
  if (day > daysIn(year, month)) {
    throw new InvalidInvoiceError(field, `le ${value} n'existe pas`);
  }
}

function daysIn(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === FEBRUARY && leap ? LEAP_FEBRUARY_DAYS : (DAYS_IN_MONTH[month - 1] ?? 0);
}

/** Une empreinte SHA-256 en hexadécimal minuscule. @throws {InvalidInvoiceError} */
export function assertSha256(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new InvalidInvoiceError(
      "empreinte du document",
      "SHA-256 en 64 caractères hexadécimaux attendu",
    );
  }
}

/**
 * Chaque ligne est bien formée : un produit nommé, une quantité admise par
 * son unité, des montants entiers et non négatifs. @throws {InvalidInvoiceError}
 */
export function assertLines(lines: readonly InvoiceLineInput[]): void {
  if (lines.length === 0) {
    throw new InvalidInvoiceError("lignes", "une facture porte au moins une ligne");
  }
  for (const line of lines) {
    if (line.sku.trim() === "" || line.label.trim() === "") {
      throw new InvalidInvoiceError(
        "ligne",
        "un produit sans référence ou sans nom ne se facture pas",
      );
    }
    InvoiceQuantity.ofThousandths(line.quantityThousandths, line.unitCode);
    if (
      !isNonNegativeInteger(line.amountCents) ||
      !isNonNegativeInteger(line.unitPriceMillicents)
    ) {
      throw new InvalidInvoiceError(`ligne ${line.sku}`, "montants en entiers positifs attendus");
    }
    if (!Number.isFinite(line.vatRate) || line.vatRate < 0) {
      throw new InvalidInvoiceError(
        `ligne ${line.sku}`,
        `taux de TVA ${String(line.vatRate)} illisible`,
      );
    }
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * La ventilation se recompose : marchandise des lignes par taux, base
 * imposable = marchandise − remises + frais, Σ bases = total HT, Σ TVA = total
 * TVA, TTC = HT + TVA. Une ventilation qui ne tombe pas juste est un défaut
 * d'assemblage, jamais corrigé ici. @throws {InvoiceTotalsMismatchError}
 */
export function assertTotals(
  number: string,
  lines: readonly InvoiceLineInput[],
  vat: InvoiceVatBreakdown,
): void {
  const fail = (reason: string): never => {
    throw new InvoiceTotalsMismatchError(number, reason);
  };
  for (const category of vat.categories) {
    const goods = sum(lines.filter((l) => l.vatRate === category.rate).map((l) => l.amountCents));
    if (goods !== category.goodsHtCents) {
      fail(
        `marchandise à ${String(category.rate)} % : lignes ${String(goods)} c, ventilation ${String(category.goodsHtCents)} c`,
      );
    }
    if (
      taxableBaseOf(category) !== category.taxableBaseCents ||
      category.taxableBaseCents < 0 ||
      category.vatCents < 0
    ) {
      fail(`base imposable à ${String(category.rate)} % incohérente`);
    }
  }
  const rates = new Set(vat.categories.map((category) => category.rate));
  if (lines.some((line) => !rates.has(line.vatRate))) {
    fail("une ligne porte un taux absent de la ventilation");
  }
  if (sum(vat.categories.map((c) => c.taxableBaseCents)) !== vat.taxableBaseCents) {
    fail("Σ bases imposables ≠ total HT");
  }
  if (sum(vat.categories.map((c) => c.vatCents)) !== vat.vatCents) {
    fail("Σ TVA par taux ≠ total TVA");
  }
  if (vat.taxableBaseCents + vat.vatCents !== vat.totalCents) {
    fail("TTC ≠ HT + TVA");
  }
}

function taxableBaseOf(category: InvoiceVatCategory): number {
  const allowances = sum(category.allowances.map((part) => part.amountCents));
  const charges = sum(category.charges.map((part) => part.amountCents));
  return category.goodsHtCents - allowances + charges;
}

/**
 * L'avoir ne rend pas plus que ce qui reste à corriger, taux par taux : sa
 * base et sa TVA, ajoutées à celles des avoirs déjà émis sur la même facture,
 * ne dépassent pas celles de la facture. Un taux absent de la facture n'a
 * rien à corriger. @throws {CreditNoteExceedsInvoiceError}
 */
export function assertWithinCorrected(
  correctedNumber: string,
  corrected: InvoiceVatBreakdown,
  prior: readonly InvoiceVatBreakdown[],
  credit: InvoiceVatBreakdown,
): void {
  if (credit.totalCents <= 0) {
    throw new CreditNoteExceedsInvoiceError(
      correctedNumber,
      0,
      "un avoir porte un montant positif",
    );
  }
  for (const category of credit.categories) {
    const invoiced = corrected.categories.find((c) => c.rate === category.rate);
    if (invoiced === undefined) {
      throw new CreditNoteExceedsInvoiceError(
        correctedNumber,
        category.rate,
        "taux absent de la facture",
      );
    }
    const already = prior.flatMap((b) => b.categories.filter((c) => c.rate === category.rate));
    const baseLeft = invoiced.taxableBaseCents - sum(already.map((c) => c.taxableBaseCents));
    const vatLeft = invoiced.vatCents - sum(already.map((c) => c.vatCents));
    if (category.taxableBaseCents > baseLeft || category.vatCents > vatLeft) {
      throw new CreditNoteExceedsInvoiceError(
        correctedNumber,
        category.rate,
        `reste ${String(baseLeft)} c HT et ${String(vatLeft)} c de TVA`,
      );
    }
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** BT-89 : une RUM, 35 caractères au plus (SEPA). */
const MANDATE_REFERENCE_MAX = 35;

export function assertPaymentMeans(means: InvoicePaymentMeans | null): void {
  if (means === null) {
    return;
  }
  const reference = means.mandateReference;
  if (reference.trim() === "" || reference.length > MANDATE_REFERENCE_MAX) {
    throw new InvalidInvoiceError(
      "moyen de paiement",
      `RUM « ${reference} » vide ou plus longue que ${String(MANDATE_REFERENCE_MAX)} caractères`,
    );
  }
}
