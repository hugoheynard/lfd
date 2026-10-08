import { InvoiceDossierUnreadableVatRateError } from "../errors/invoice-dossier-errors.js";
import { PIECE_UNIT } from "../value-objects/invoice-unit.js";
import type { FrozenInvoiceOrder, InvoiceLine } from "./invoice-dossier.types.js";

/**
 * **Les lignes de la facture** : une par `(sku, prix, taux normalisé)` (plan
 * simulateur, D2 et §3.1). Un changement de tarif ou de taux dans le cycle
 * fait donc deux lignes du même produit.
 *
 * ## Le montant d'une ligne est REPRIS des bons (F6, 2026-10-08)
 *
 * Il vaut Σ des `lineTotalCents` figés des bons qu'elle regroupe, et non
 * `arrondi(Σ quantité × prix)` : un client qui rapproche ses bons et sa
 * facture doit retrouver le HT au centime (Hugo, 2026-10-08,
 * `plan-bons-et-facture-concordants.md` §4). L'arrondi unique pouvait en
 * différer d'un centime par ligne.
 *
 * La norme l'admet (F6-0, lu sur les sources le 2026-10-08) : le Schematron
 * CEN EN 16931 (CII) n'a aucune règle sur BT-131 = BT-129 × BT-146 ÷ BT-149 ;
 * Peppol PEPPOL-EN16931-R120 la vérifie avec une tolérance de 0,02. Les règles
 * de la plateforme de réception française n'ont pas été vérifiées.
 */

/**
 * Le taux figé (« 5.50 ») en nombre : « 5.50 » et « 5.5 » sont le même taux,
 * et la même clé. Un taux illisible arrête le dossier plutôt que de créer une
 * catégorie `NaN`.
 */
export function normalizedVatRate(raw: string, orderReference: string): number {
  const rate = Number(raw.trim());
  if (raw.trim() === "" || !Number.isFinite(rate)) {
    throw new InvoiceDossierUnreadableVatRateError(orderReference, raw);
  }
  return rate;
}

interface LineAccumulator {
  readonly sku: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  quantity: number;
  ordersLineTotalCents: number;
  label: string;
  labelAt: number;
  readonly labels: Set<string>;
  firstDeliveryDate: string | null;
  lastDeliveryDate: string | null;
}

/** Agrège les lignes des bons en lignes de facture, triées par sku, prix puis taux. */
export function aggregateInvoiceLines(
  orders: readonly FrozenInvoiceOrder[],
): readonly InvoiceLine[] {
  const byKey = new Map<string, LineAccumulator>();
  for (const order of orders) {
    for (const line of order.lines) {
      const vatRate = normalizedVatRate(line.vatRate, order.reference);
      const key = `${line.sku}|${String(line.unitPriceMillicents)}|${String(vatRate)}`;
      const acc = byKey.get(key) ?? openAccumulator(line.sku, line.unitPriceMillicents, vatRate);
      byKey.set(key, acc);
      accumulate(acc, order, line.productNameSnapshot, line.quantity, line.lineTotalCents);
    }
  }
  return [...byKey.values()].sort(compareLines).map(closeAccumulator);
}

function openAccumulator(
  sku: string,
  unitPriceMillicents: number,
  vatRate: number,
): LineAccumulator {
  return {
    sku,
    unitPriceMillicents,
    vatRate,
    quantity: 0,
    ordersLineTotalCents: 0,
    label: "",
    labelAt: Number.NEGATIVE_INFINITY,
    labels: new Set<string>(),
    firstDeliveryDate: null,
    lastDeliveryDate: null,
  };
}

function accumulate(
  acc: LineAccumulator,
  order: FrozenInvoiceOrder,
  name: string,
  quantity: number,
  orderLineCents: number,
): void {
  acc.quantity += quantity;
  acc.ordersLineTotalCents += orderLineCents;
  acc.labels.add(name);
  // À égalité d'instant, le dernier lu l'emporte : l'ordre d'entrée tranche.
  if (order.createdAt.getTime() >= acc.labelAt) {
    acc.label = name;
    acc.labelAt = order.createdAt.getTime();
  }
  const date = order.requestedDeliveryDate;
  if (date !== null) {
    acc.firstDeliveryDate =
      acc.firstDeliveryDate === null || date < acc.firstDeliveryDate ? date : acc.firstDeliveryDate;
    acc.lastDeliveryDate =
      acc.lastDeliveryDate === null || date > acc.lastDeliveryDate ? date : acc.lastDeliveryDate;
  }
}

function closeAccumulator(acc: LineAccumulator): InvoiceLine {
  return {
    sku: acc.sku,
    unitPriceMillicents: acc.unitPriceMillicents,
    vatRate: acc.vatRate,
    label: acc.label,
    otherLabels: [...acc.labels].filter((name) => name !== acc.label).sort(),
    // Toutes à la pièce (Q5, Hugo, 2026-10-08) : un bon ne porte qu'une
    // quantité entière d'unités du catalogue. La vente au poids changera la
    // clé d'agrégation, pas cette ligne seule.
    unitCode: PIECE_UNIT,
    quantity: acc.quantity,
    amountCents: acc.ordersLineTotalCents,
    ordersLineTotalCents: acc.ordersLineTotalCents,
    firstDeliveryDate: acc.firstDeliveryDate,
    lastDeliveryDate: acc.lastDeliveryDate,
  };
}

function compareLines(left: LineAccumulator, right: LineAccumulator): number {
  if (left.sku !== right.sku) {
    return left.sku < right.sku ? -1 : 1;
  }
  if (left.unitPriceMillicents !== right.unitPriceMillicents) {
    return left.unitPriceMillicents - right.unitPriceMillicents;
  }
  return left.vatRate - right.vatRate;
}
