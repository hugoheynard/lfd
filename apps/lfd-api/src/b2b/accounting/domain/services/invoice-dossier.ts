import {
  invoiceVatBreakdown,
  type InvoiceCharge,
  type InvoiceVatBreakdown,
  type RatedCents,
} from "@lfd/money";

import type {
  FrozenDeliveryVatMode,
  FrozenInvoiceOrder,
  Invoice,
  InvoiceDeliveryLine,
  InvoiceDossier,
  InvoiceGaps,
  VatRoundingGap,
} from "./invoice-dossier.types.js";
import { aggregateInvoiceLines } from "./invoice-lines.js";
import { inconsistentOrders } from "./invoice-order-consistency.js";
import {
  lateFeeOf,
  splitInvoiceOrder,
  standardDeliveryOf,
  type OrderInvoiceSplit,
} from "./invoice-order-split.js";

/**
 * **Le simulateur de dossier de facturation** — pur, sans horloge ni base.
 *
 * ## 🔴 La facture additionne ses bons ; elle ne répartit rien
 *
 * Le HT des lignes est repris des bons (F6, 2026-10-08, `invoice-lines.ts`).
 * Les remises et le port qui suit la marchandise le sont aussi, **taux par
 * taux** : chaque bon les découpe sur ses propres lignes, au plus fort reste
 * (`invoice-order-split.ts`), et la facture somme ces parts par motif et par
 * taux (plan `plan-remises-ventilees-bon-par-bon.md`, R1-R3, 2026-10-22). Une
 * répartition faite une fois sur le cycle faisait glisser la remise d'un bon
 * sur les taux d'un autre — un écart de composition rangé en « arrondi ».
 *
 * Seule la TVA se recalcule : une fois par taux, sur la base imposable entière
 * de la facture (BR-S-09). Ce qui sépare la facture de la somme des bons se
 * range en écarts — arrondi de la TVA, TVA non ventilée, bon incohérent — dont
 * la somme est la différence, au centime (plan
 * `simulateur-dossier-de-facturation.md`, D4, §3.4). L'arrondi de la TVA est
 * désormais un pur arrondi : le bon arrondit `base exacte × taux`, la facture
 * `Σ parts entières × taux`.
 *
 * ## La part de TVA des bons non ventilés
 *
 * La TVA d'un taux est calculée sur toute la facture ; le plan range pourtant
 * à part « la TVA des bons d'avant le 2026-09-07 dans la facture ». Elle est
 * prise ici comme la TVA de la facture **que ces seuls bons feraient** — leurs
 * parts découpées de la même façon (R5) —, et l'arrondi de la TVA reçoit le
 * reste. La somme des deux écarts ne dépend pas de ce choix ; leur partage, si.
 *
 * Un bon dont les parts figées ne retombent pas sur son `vatCents` est traité
 * comme non ventilé, comme au relevé de cycle (`cycle-statement.ts`) : sans
 * quoi l'invariant dépendrait de la santé de chaque JSON.
 */

export const COMPANY_DISCOUNT = "company_discount";
export const LOYALTY_VOUCHER = "loyalty_voucher";
export const DELIVERY_STANDARD = "delivery_standard";
export const DELIVERY_FOLLOWS_GOODS = "delivery_follows_goods";
export const LATE_FEE_PREFIX = "late_fee:";

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

/** La facture de ces bons : leurs parts additionnées, la TVA calculée une fois. */
function buildInvoice(orders: readonly FrozenInvoiceOrder[]): Invoice {
  const lines = aggregateInvoiceLines(orders);
  const splits = orders.map(splitInvoiceOrder);
  const vat = invoiceVatBreakdown({
    goods: lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
    allowances: [
      { key: COMPANY_DISCOUNT, byRate: splits.flatMap((split) => split.pickupDiscount) },
      { key: LOYALTY_VOUCHER, byRate: splits.flatMap((split) => split.voucher) },
    ],
    charges: [...deliveryCharges(splits), ...lateFeeCharges(orders)],
  });
  return {
    lines,
    companyDiscountCents: sum(splits.map((split) => split.pickupDiscountCents)),
    voucherDiscountCents: sum(splits.map((split) => split.voucherCents)),
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

/** Le port au taux normal, et le port qui suit la vente — les parts de ses bons. */
function deliveryCharges(splits: readonly OrderInvoiceSplit[]): readonly InvoiceCharge[] {
  const standard = splits.map(standardDeliveryOf).filter((part) => part !== null);
  const following = splits.flatMap((split) => split.followingDelivery);
  const charges: InvoiceCharge[] = [];
  if (standard.length > 0) {
    charges.push({ key: DELIVERY_STANDARD, byRate: standard });
  }
  if (following.length > 0) {
    charges.push({ key: DELIVERY_FOLLOWS_GOODS, byRate: following });
  }
  return charges;
}

/** La surtaxe, une charge par taux ; un bon sans taux arrête le dossier. */
function lateFeeCharges(orders: readonly FrozenInvoiceOrder[]): readonly InvoiceCharge[] {
  const byRate = new Map<number, RatedCents[]>();
  for (const order of orders) {
    const fee = lateFeeOf(order);
    if (fee !== null) {
      byRate.set(fee.vatRate, [...(byRate.get(fee.vatRate) ?? []), fee]);
    }
  }
  return [...byRate.entries()].map(([vatRate, parts]) => ({
    key: `${LATE_FEE_PREFIX}${String(vatRate)}`,
    byRate: parts,
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
