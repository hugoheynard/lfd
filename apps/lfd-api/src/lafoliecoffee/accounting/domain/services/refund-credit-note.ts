import { millicentsFromCents, type InvoiceVatBreakdown, type InvoiceVatCategory } from "@lfd/money";

import type { InvoiceLineInput } from "../entities/invoice.types.js";

/**
 * **L'avoir d'un remboursement** (plan `facture-carte-et-remboursements.md` ; arbitrage A9) : Stripe rend un montant, pas des
 * produits. Le montant se ventile donc par taux au **prorata** de ce que la
 * facture porte encore, et le remboursement qui **solde** prend le reste
 * exact, base et TVA, taux par taux — la somme des avoirs égale alors la
 * facture au centime, et `assertWithinCorrected` ne refuse jamais le dernier.
 *
 * Pur : la facture, les avoirs déjà émis et le montant sont donnés.
 */

/** Le libellé de la ligne d'un avoir de remboursement — une par taux. */
export const REFUND_LINE_LABEL = "Remboursement";
/** La référence de cette ligne : une valeur, pas un produit du catalogue. */
export const REFUND_LINE_SKU = "REMBOURSEMENT";

const PERCENT = 100;
const ONE_PIECE_THOUSANDTHS = 1_000;

/** Ce qui reste à corriger sur un taux : base, TVA, et leur somme. */
interface RateLeft {
  readonly rate: number;
  readonly baseCents: number;
  readonly vatCents: number;
  readonly ttcCents: number;
}

/** Ce qui reste à corriger sur la facture, taux par taux — et en TTC. */
export function remainingByRate(
  invoice: InvoiceVatBreakdown,
  prior: readonly InvoiceVatBreakdown[],
): readonly RateLeft[] {
  return invoice.categories.map((category) => {
    const already = prior.flatMap((b) => b.categories.filter((c) => c.rate === category.rate));
    const baseCents = category.taxableBaseCents - sum(already.map((c) => c.taxableBaseCents));
    const vatCents = category.vatCents - sum(already.map((c) => c.vatCents));
    return { rate: category.rate, baseCents, vatCents, ttcCents: baseCents + vatCents };
  });
}

/** Le TTC qui reste à corriger. */
export function remainingTtcCents(
  invoice: InvoiceVatBreakdown,
  prior: readonly InvoiceVatBreakdown[],
): number {
  return sum(remainingByRate(invoice, prior).map((left) => left.ttcCents));
}

/** La ventilation et les lignes d'un avoir. */
export interface RefundCreditNote {
  readonly vat: InvoiceVatBreakdown;
  readonly lines: readonly InvoiceLineInput[];
}

/**
 * Ventile `refundCents` (TTC) sur ce qui reste à corriger.
 *
 * - **Solde** (`refundCents` = le reste) : chaque taux rend exactement sa base
 *   et sa TVA restantes.
 * - **Sinon** : le TTC se partage au prorata du TTC restant de chaque taux
 *   (plus forts restes, ex aequo au premier taux), puis la part de chaque
 *   taux se coupe en base et TVA au taux (`part ÷ (1 + taux)`), ramenée dans
 *   ce que le taux porte encore : aucune part ne dépasse son reste.
 *
 * Le prorata porte sur le RESTE, pas sur la facture d'origine : tant que les
 * avoirs précédents sont eux-mêmes au prorata, c'est la même proportion à
 * l'arrondi près — et c'est ce qui garantit qu'aucun taux ne passe sous zéro.
 *
 * @returns `null` quand le montant est nul ou dépasse ce qui reste : il n'y a
 *   pas d'avoir juste à émettre, l'appelant le signale.
 */
export function refundCreditNote(
  invoice: InvoiceVatBreakdown,
  prior: readonly InvoiceVatBreakdown[],
  refundCents: number,
): RefundCreditNote | null {
  const left = remainingByRate(invoice, prior).filter((rate) => rate.ttcCents > 0);
  const totalLeft = sum(left.map((rate) => rate.ttcCents));
  if (!Number.isSafeInteger(refundCents) || refundCents <= 0 || refundCents > totalLeft) {
    return null;
  }
  const parts =
    refundCents === totalLeft
      ? left.map((rate) => ({ rate: rate.rate, base: rate.baseCents, vat: rate.vatCents }))
      : prorate(left, totalLeft, refundCents);
  const categories = parts
    .filter((part) => part.base + part.vat > 0)
    .map((part) => categoryOf(part.rate, part.base, part.vat));
  return { vat: breakdownOf(categories), lines: categories.map(lineOf) };
}

function prorate(
  left: readonly RateLeft[],
  totalLeft: number,
  refundCents: number,
): readonly { rate: number; base: number; vat: number }[] {
  const shares = largestRemainder(
    left.map((rate) => rate.ttcCents),
    totalLeft,
    refundCents,
  );
  return left.map((rate, index) => {
    const share = shares[index] ?? 0;
    // La base qui rend la TVA du taux (BR-S-09 : TVA = base × taux, au
    // centime près), ramenée dans ce que le taux porte encore.
    const exact = Math.round((share * PERCENT) / (PERCENT + rate.rate));
    const base = Math.min(rate.baseCents, Math.max(share - rate.vatCents, exact));
    return { rate: rate.rate, base, vat: share - base };
  });
}

/**
 * Partage `amount` au prorata de `weights` (Σ = `total`) en entiers : la
 * partie entière d'abord, puis un centime aux plus forts restes.
 */
function largestRemainder(
  weights: readonly number[],
  total: number,
  amount: number,
): readonly number[] {
  const floors = weights.map((weight) => Math.floor((amount * weight) / total));
  const remainders = weights.map((weight, index) => ({
    index,
    rest: amount * weight - (floors[index] ?? 0) * total,
  }));
  let missing = amount - sum(floors);
  const shares = [...floors];
  for (const { index } of [...remainders].sort((a, b) => b.rest - a.rest || a.index - b.index)) {
    if (missing === 0) {
      break;
    }
    shares[index] = (shares[index] ?? 0) + 1;
    missing -= 1;
  }
  return shares;
}

function categoryOf(rate: number, base: number, vat: number): InvoiceVatCategory {
  return {
    rate,
    goodsHtCents: base,
    allowances: [],
    charges: [],
    taxableBaseCents: base,
    vatCents: vat,
  };
}

function breakdownOf(categories: readonly InvoiceVatCategory[]): InvoiceVatBreakdown {
  const base = sum(categories.map((c) => c.taxableBaseCents));
  const vat = sum(categories.map((c) => c.vatCents));
  return {
    categories,
    goodsHtCents: base,
    allowancesCents: 0,
    chargesCents: 0,
    taxableBaseCents: base,
    vatCents: vat,
    totalCents: base + vat,
  };
}

function lineOf(category: InvoiceVatCategory): InvoiceLineInput {
  return {
    sku: REFUND_LINE_SKU,
    label: REFUND_LINE_LABEL,
    unitCode: "H87",
    quantityThousandths: ONE_PIECE_THOUSANDTHS,
    unitPriceMillicents: millicentsFromCents(category.taxableBaseCents),
    vatRate: category.rate,
    amountCents: category.taxableBaseCents,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
