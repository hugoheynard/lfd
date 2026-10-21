import {
  type CompanyOrderSummaryView,
  ORDER_SUMMARY_MAX_ORDERS,
  type OrderSummaryBottomView,
  type OrderSummaryCompanyView,
  type OrderSummaryExcludedView,
  type OrderSummaryExclusionReason,
  type OrderSummaryProductView,
  type OrderSummaryTableView,
  type PaymentStatus,
  type VatShareView,
} from "@lfd/contracts";

import {
  OrderSummaryOrdersNotFoundError,
  OrderSummaryTooManyOrdersError,
} from "../errors/order-summary-errors.js";

/** Une ligne figée à la passation — ce que le récapitulatif en lit. */
export interface OrderSummaryLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  /** `line_total_cents` — HT, en centimes. */
  readonly lineTotalCents: number;
}

/**
 * Une commande telle que le récapitulatif la lit : ses colonnes d'argent
 * (centimes, figées à la passation) et sa société.
 */
export interface OrderSummarySource {
  readonly id: string;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly cancelled: boolean;
  readonly paymentStatus: PaymentStatus;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  /** `null` : commande sans ventilation par taux. */
  readonly vatShares: readonly VatShareView[] | null;
  readonly totalCents: number;
  readonly lines: readonly OrderSummaryLine[];
}

const PAYMENT_EXCLUSIONS: Readonly<Partial<Record<PaymentStatus, OrderSummaryExclusionReason>>> = {
  pending: "payment_pending",
  failed: "payment_failed",
};

/**
 * La sélection, sans doublon, refusée au-delà du plafond (§6.5) — avant
 * toute lecture.
 */
export function summarySelectionOf(orderIds: readonly string[]): readonly string[] {
  const unique = [...new Set(orderIds)];
  if (unique.length > ORDER_SUMMARY_MAX_ORDERS) {
    throw new OrderSummaryTooManyOrdersError(unique.length, ORDER_SUMMARY_MAX_ORDERS);
  }
  return unique;
}

/**
 * Toute commande demandée doit avoir été lue sous le mur : un id absent est
 * nommé, jamais un récapitulatif partiel (§2).
 */
export function ensureAllSummarized(
  orderIds: readonly string[],
  sources: readonly OrderSummarySource[],
): void {
  const found = new Set(sources.map((source) => source.id));
  const missing = orderIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new OrderSummaryOrdersNotFoundError(missing);
  }
}

/**
 * **Le récapitulatif de commandes** (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, §6) — pur.
 *
 * Comme une facture (§6.1) : par produit, la quantité et le HT ; puis un bas
 * dont chaque ligne est la SOMME de la colonne des commandes. Le bas est donc
 * exactement la somme des commandes : aucun écart d'arrondi à expliquer,
 * parce qu'on ne recalcule rien. Une table par société, la société listée en
 * tête, puis le total général (§6.2). Annulées et paiements en attente ou
 * refusés sont hors des totaux, et listés (§6.5).
 *
 * `sources` : la plus récente en tête — le nom d'un produit est celui de la
 * première commande qui le porte.
 */
export function summarizeOrders(
  listedCompanyId: string,
  sources: readonly OrderSummarySource[],
): CompanyOrderSummaryView {
  const excluded: OrderSummaryExcludedView[] = [];
  const included: OrderSummarySource[] = [];
  for (const source of sources) {
    const reason = exclusionOf(source);
    if (reason === null) {
      included.push(source);
    } else {
      excluded.push({ orderId: source.id, orderNumber: source.orderNumber, reason });
    }
  }
  return {
    amountsAt: "placement",
    companies: companyTables(listedCompanyId, included),
    total: tableOf(included),
    excluded,
  };
}

function exclusionOf(source: OrderSummarySource): OrderSummaryExclusionReason | null {
  if (source.cancelled) {
    return "cancelled";
  }
  return PAYMENT_EXCLUSIONS[source.paymentStatus] ?? null;
}

function companyTables(
  listedCompanyId: string,
  orders: readonly OrderSummarySource[],
): readonly OrderSummaryCompanyView[] {
  const byCompany = new Map<
    string,
    { readonly name: string; readonly orders: OrderSummarySource[] }
  >();
  for (const order of orders) {
    const bucket = byCompany.get(order.companyId) ?? { name: order.companyName, orders: [] };
    bucket.orders.push(order);
    byCompany.set(order.companyId, bucket);
  }
  const tables = [...byCompany.entries()].map(([companyId, bucket]) => ({
    companyId,
    name: bucket.name,
    ...tableOf(bucket.orders),
  }));
  return tables.sort((a, b) => companyRank(a, b, listedCompanyId));
}

function companyRank(
  a: OrderSummaryCompanyView,
  b: OrderSummaryCompanyView,
  listedCompanyId: string,
): number {
  if (a.companyId === listedCompanyId) {
    return -1;
  }
  if (b.companyId === listedCompanyId) {
    return 1;
  }
  return a.name.localeCompare(b.name, "fr") || a.companyId.localeCompare(b.companyId);
}

function tableOf(orders: readonly OrderSummarySource[]): OrderSummaryTableView {
  return {
    orderCount: orders.length,
    products: productsOf(orders),
    bottom: bottomOf(orders),
  };
}

function productsOf(orders: readonly OrderSummarySource[]): readonly OrderSummaryProductView[] {
  const bySku = new Map<string, OrderSummaryProductView>();
  for (const line of orders.flatMap((order) => order.lines)) {
    const known = bySku.get(line.sku);
    bySku.set(line.sku, {
      sku: line.sku,
      name: known?.name ?? line.name,
      quantity: (known?.quantity ?? 0) + line.quantity,
      htCents: (known?.htCents ?? 0) + line.lineTotalCents,
    });
  }
  return [...bySku.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "fr") || a.sku.localeCompare(b.sku),
  );
}

function bottomOf(orders: readonly OrderSummarySource[]): OrderSummaryBottomView {
  const sum = (pick: (order: OrderSummarySource) => number): number =>
    orders.reduce((total, order) => total + pick(order), 0);
  return {
    subtotalCents: sum((o) => o.subtotalCents),
    discountCents: sum((o) => o.discountCents),
    voucherDiscountCents: sum((o) => o.voucherDiscountCents),
    deliveryFeeCents: sum((o) => o.deliveryFeeCents),
    lateFeeCents: sum((o) => o.lateFeeCents),
    vat: vatByRate(orders),
    unventilatedVatCents: sum((o) => (o.vatShares === null ? o.vatCents : 0)),
    totalCents: sum((o) => o.totalCents),
  };
}

function vatByRate(orders: readonly OrderSummarySource[]): readonly VatShareView[] {
  const byRate = new Map<number, number>();
  for (const share of orders.flatMap((order) => order.vatShares ?? [])) {
    byRate.set(share.rate, (byRate.get(share.rate) ?? 0) + share.amountCents);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, amountCents]) => ({ rate, amountCents }));
}
