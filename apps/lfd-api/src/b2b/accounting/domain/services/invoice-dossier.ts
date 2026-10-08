import {
  DELIVERY_VAT_RATE,
  invoiceVatBreakdown,
  type InvoiceCharge,
  type InvoiceVatBreakdown,
  type VatLine,
} from "@lfd/money";

import { InvoiceDossierLateFeeRateMissingError } from "../errors/invoice-dossier-errors.js";
import type {
  FrozenDeliveryVatMode,
  FrozenInvoiceOrder,
  Invoice,
  InvoiceDeliveryLine,
  InvoiceDossier,
  InvoiceGaps,
  VatRoundingGap,
} from "./invoice-dossier.types.js";
import { aggregateInvoiceLines, normalizedVatRate } from "./invoice-lines.js";
import { inconsistentOrders } from "./invoice-order-consistency.js";

/**
 * **Le simulateur de dossier de facturation** — pur, sans horloge ni base.
 *
 * ## 🔴 La facture est calculée en une fois ; les bons restent des bons
 *
 * La norme des factures structurées calcule la TVA d'un taux sur la facture
 * entière ; nos bons l'arrondissent bon par bon. Le HT des lignes, lui, est
 * repris des bons (F6, 2026-10-08, `invoice-lines.ts`) ; la TVA se recalcule
 * sur l'agrégat, et ce qui sépare la facture de la somme des bons se range en
 * écarts — arrondi de la TVA, TVA non ventilée, bon incohérent — dont la
 * somme est la différence, au centime (plan
 * `plan-simulateur-dossier-de-facturation.md`, D4, §3.4).
 *
 * ## La part de TVA des bons non ventilés
 *
 * La TVA d'un taux est calculée sur toute la facture ; le plan range pourtant
 * à part « la TVA des bons d'avant le 2026-09-07 dans la facture ». Elle est
 * prise ici comme la TVA de la facture **que ces seuls bons feraient**, et
 * l'arrondi de la TVA reçoit le reste. La somme des deux écarts ne dépend pas
 * de ce choix ; leur partage, si — il est remonté au plan.
 *
 * Un bon dont les parts figées ne retombent pas sur son `vatCents` est traité
 * comme non ventilé, comme au relevé de cycle (`cycle-statement.ts`) : sans
 * quoi l'invariant dépendrait de la santé de chaque JSON.
 */

const COMPANY_DISCOUNT = "company_discount";
const LOYALTY_VOUCHER = "loyalty_voucher";
const DELIVERY_STANDARD = "delivery_standard";
const DELIVERY_FOLLOWS_GOODS = "delivery_follows_goods";
const LATE_FEE_PREFIX = "late_fee:";

/** Calcule le dossier d'un payeur sur un cycle, à partir de ses bons figés. */
export function simulateInvoiceDossier(orders: readonly FrozenInvoiceOrder[]): InvoiceDossier {
  const invoice = buildInvoice(orders);
  const unventilated = orders.filter((order) => !isVentilated(order));
  const unventilatedVat = unventilated.length === 0 ? null : buildInvoice(unventilated).vat;
  const ordersTotalCents = sum(orders.map((order) => order.totalCents));
  const inconsistent = inconsistentOrders(orders);
  const inconsistentCents = sum(inconsistent.map((order) => order.gapCents));
  return {
    invoice,
    ordersTotalCents,
    differenceCents: invoice.totalCents - ordersTotalCents,
    gaps: gapsOf(invoice, orders, unventilatedVat, inconsistentCents),
    inconsistentOrders: inconsistent,
    threeGapInvariantHolds: inconsistent.length === 0,
  };
}

/** La facture de ces bons, en une fois. */
function buildInvoice(orders: readonly FrozenInvoiceOrder[]): Invoice {
  const lines = aggregateInvoiceLines(orders);
  const companyDiscountCents = sum(orders.map((order) => order.discountCents));
  const voucherDiscountCents = sum(orders.map((order) => order.voucherDiscountCents));
  const vat = invoiceVatBreakdown({
    goods: lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
    allowances: [
      { key: COMPANY_DISCOUNT, amountCents: companyDiscountCents },
      { key: LOYALTY_VOUCHER, amountCents: voucherDiscountCents },
    ],
    charges: [...deliveryCharges(orders), ...lateFeeCharges(orders)],
  });
  return {
    lines,
    companyDiscountCents,
    voucherDiscountCents,
    lateFeeCents: sum(orders.map((order) => order.lateFeeCents)),
    deliveries: deliveryLines(orders),
    vat,
    totalCents: vat.totalCents,
  };
}

/** `null` se lit taux normal : c'est ce que le bon a réellement facturé. */
function modeOf(order: FrozenInvoiceOrder): FrozenDeliveryVatMode {
  return order.deliveryVatMode ?? "standard";
}

function deliveryLines(orders: readonly FrozenInvoiceOrder[]): readonly InvoiceDeliveryLine[] {
  const modes: readonly FrozenDeliveryVatMode[] = ["standard", "follows_goods"];
  return modes
    .map((mode) => {
      const ofMode = orders.filter(
        (order) => modeOf(order) === mode && order.deliveryFeeCents !== 0,
      );
      return {
        mode,
        present: ofMode.length > 0,
        amountCents: sum(ofMode.map((o) => o.deliveryFeeCents)),
      };
    })
    .filter((line) => line.present)
    .map(({ mode, amountCents }) => ({ mode, amountCents }));
}

/**
 * Le port au taux normal, et le port qui suit la vente — réparti au prorata
 * des bases marchandise DES SEULS bons en ce mode, lues sur leurs lignes figées.
 */
function deliveryCharges(orders: readonly FrozenInvoiceOrder[]): readonly InvoiceCharge[] {
  const standard = orders.filter((o) => modeOf(o) === "standard");
  const following = orders.filter((o) => modeOf(o) === "follows_goods");
  const charges: InvoiceCharge[] = [];
  const standardCents = sum(standard.map((o) => o.deliveryFeeCents));
  if (standardCents !== 0) {
    charges.push({ key: DELIVERY_STANDARD, htCents: standardCents, vatRate: DELIVERY_VAT_RATE });
  }
  const followingCents = sum(following.map((o) => o.deliveryFeeCents));
  if (followingCents !== 0) {
    const carrying = following.filter((o) => o.deliveryFeeCents !== 0);
    charges.push({
      key: DELIVERY_FOLLOWS_GOODS,
      htCents: followingCents,
      prorataBases: goodsOf(carrying),
    });
  }
  return charges;
}

function goodsOf(orders: readonly FrozenInvoiceOrder[]): readonly VatLine[] {
  return orders.flatMap((order) =>
    order.lines.map((line) => ({
      htCents: line.lineTotalCents,
      vatRate: normalizedVatRate(line.vatRate, order.reference),
    })),
  );
}

/** La surtaxe, une charge par taux ; un bon sans taux arrête le dossier. */
function lateFeeCharges(orders: readonly FrozenInvoiceOrder[]): readonly InvoiceCharge[] {
  const byRate = new Map<number, number>();
  for (const order of orders) {
    if (order.lateFeeCents === 0) {
      continue;
    }
    if (order.lateFeeVatRate === null) {
      throw new InvoiceDossierLateFeeRateMissingError(order.reference);
    }
    byRate.set(order.lateFeeVatRate, (byRate.get(order.lateFeeVatRate) ?? 0) + order.lateFeeCents);
  }
  return [...byRate.entries()].map(([vatRate, htCents]) => ({
    key: `${LATE_FEE_PREFIX}${String(vatRate)}`,
    htCents,
    vatRate,
  }));
}

function isVentilated(order: FrozenInvoiceOrder): boolean {
  return (
    order.vatShares !== null &&
    sum(order.vatShares.map((share) => share.amountCents)) === order.vatCents
  );
}

function gapsOf(
  invoice: Invoice,
  orders: readonly FrozenInvoiceOrder[],
  unventilatedVat: InvoiceVatBreakdown | null,
  inconsistentOrdersCents: number,
): InvoiceGaps {
  const vatRounding = vatRoundingGaps(invoice.vat, orders, unventilatedVat);
  const unventilatedInvoiceCents = unventilatedVat?.vatCents ?? 0;
  const unventilatedOrdersCents = sum(
    orders.filter((o) => !isVentilated(o)).map((o) => o.vatCents),
  );
  const vatRoundingCents = sum(vatRounding.map((gap) => gap.gapCents));
  const unventilatedGapCents = unventilatedInvoiceCents - unventilatedOrdersCents;
  return {
    vatRounding,
    vatRoundingCents,
    unventilatedVat: {
      invoiceVatCents: unventilatedInvoiceCents,
      ordersVatCents: unventilatedOrdersCents,
      gapCents: unventilatedGapCents,
    },
    inconsistentOrdersCents,
    totalCents: vatRoundingCents + unventilatedGapCents + inconsistentOrdersCents,
  };
}

function vatRoundingGaps(
  vat: InvoiceVatBreakdown,
  orders: readonly FrozenInvoiceOrder[],
  unventilatedVat: InvoiceVatBreakdown | null,
): readonly VatRoundingGap[] {
  const invoiceByRate = vatByRate(vat);
  const unventilatedByRate =
    unventilatedVat === null ? new Map<number, number>() : vatByRate(unventilatedVat);
  const sharesByRate = new Map<number, number>();
  for (const order of orders.filter(isVentilated)) {
    for (const share of order.vatShares ?? []) {
      sharesByRate.set(share.rate, (sharesByRate.get(share.rate) ?? 0) + share.amountCents);
    }
  }
  const rates = new Set([...invoiceByRate.keys(), ...sharesByRate.keys()]);
  return [...rates]
    .sort((left, right) => left - right)
    .map((rate) => {
      const invoiceVatCents = (invoiceByRate.get(rate) ?? 0) - (unventilatedByRate.get(rate) ?? 0);
      const ordersVatCents = sharesByRate.get(rate) ?? 0;
      return { rate, invoiceVatCents, ordersVatCents, gapCents: invoiceVatCents - ordersVatCents };
    });
}

function vatByRate(vat: InvoiceVatBreakdown): ReadonlyMap<number, number> {
  return new Map(vat.categories.map((category) => [category.rate, category.vatCents]));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
