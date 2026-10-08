import type { InvoiceLineInput, InvoiceState } from "../entities/invoice.types.js";
import { INVOICE_UNIT_LABELS } from "../value-objects/invoice-unit.js";
import {
  centsAmount,
  millicentsPrice,
  ratePercent,
  thousandthsQuantity,
} from "./facturx-format.js";
import { frenchDate } from "./facturx-mentions.js";

/**
 * Les **mises en forme françaises** du PDF de la facture (E3b), toutes tirées
 * des écritures du XML (`facturx-format.ts`) : un montant imprimé et le
 * montant structuré viennent du même entier, par le même chemin.
 *
 * Le séparateur de milliers est l'espace insécable U+00A0, pas l'espace fine
 * U+202F qu'écrit `Intl` : la police embarquée doit porter chaque glyphe
 * imprimé, et un glyphe absent sort en carré vide sur une pièce immuable.
 */

const NBSP = " ";

/** `"1234567.89"` → `"1 234 567,89"`. */
function frenchDecimal(dotted: string): string {
  const negative = dotted.startsWith("-");
  const [whole = "0", fraction] = (negative ? dotted.slice(1) : dotted).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, NBSP);
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `,${fraction}`}`;
}

/** `123456` → « 1 234,56 € ». */
export function euros(cents: number): string {
  return `${frenchDecimal(centsAmount(cents))}${NBSP}€`;
}

/** Le prix unitaire HT, jusqu'à cinq décimales : `123456` → « 1,23456 € ». */
export function unitPrice(millicents: number): string {
  return `${frenchDecimal(millicentsPrice(millicents))}${NBSP}€`;
}

/** `5.5` → « 5,50 % ». */
export function vatRateLabel(rate: number): string {
  return `${frenchDecimal(ratePercent(rate))}${NBSP}%`;
}

/** La quantité en millièmes et son unité : « 12 pièce(s) », « 1,25 kilogramme(s) ». */
export function quantityLabel(
  line: Pick<InvoiceLineInput, "quantityThousandths" | "unitCode">,
): string {
  return `${frenchDecimal(thousandthsQuantity(line.quantityThousandths))} ${INVOICE_UNIT_LABELS[line.unitCode]}(s)`;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
export function day(isoDate: string): string {
  return frenchDate(isoDate);
}

/** « FACTURE » ou « AVOIR » — le mot en tête de la pièce. */
export function documentTitle(state: InvoiceState): string {
  return state.correctedInvoiceId === null ? "FACTURE" : "AVOIR";
}

/** Le nom du fichier remis : `FA-2026-000001.pdf`. */
export function invoiceDocumentFileName(state: Pick<InvoiceState, "number">): string {
  return `${state.number}.pdf`;
}

/**
 * La clé de rangement du PDF : dérivée de l'entité et du numéro, et de rien
 * d'autre. Un numéro n'est attribué qu'une fois dans une entité (E2) : la
 * clé ne désigne jamais deux pièces, et n'est jamais réécrite.
 */
export function invoiceDocumentKey(state: Pick<InvoiceState, "legalEntityId" | "number">): string {
  return `invoices/${state.legalEntityId}/${state.number}.pdf`;
}
