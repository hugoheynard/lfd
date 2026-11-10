import { lineTotalCents, saleQuantity, type SaleUnit } from "@lfd/money";

import {
  InvoiceDossierMixedSaleUnitError,
  InvoiceDossierUnreadableVatRateError,
} from "../errors/invoice-dossier-errors.js";
import {
  invoiceThousandthsOf,
  invoiceUnitCodeOf,
  type InvoiceUnitCode,
} from "../value-objects/invoice-unit.js";
import type {
  FrozenInvoiceLine,
  FrozenInvoiceOrder,
  InvoiceLine,
} from "./invoice-dossier.types.js";
import { priceDiscountKey, type InvoicePriceDiscount } from "./invoice-price-discount.js";

/**
 * **Les lignes de la facture** : une par `(sku, unité, prix, taux normalisé,
 * éligibilité à la remise de retrait)` (plan simulateur, D2 et §3.1 ; V3 du
 * plan des exclusions ; plan vente au poids, § 3 bis). Un changement de tarif ou de taux dans le cycle fait
 * donc deux lignes du même produit — et une ligne exclue de la remise ne se
 * fond pas dans une ligne remisée, sans quoi la remise se répartirait sur elle.
 *
 * ## Le montant d'une ligne est REPRIS des bons (F6, 2026-10-08)
 *
 * Il vaut Σ des `lineTotalCents` figés des bons qu'elle regroupe, et non
 * `arrondi(Σ quantité × prix)` : un client qui rapproche ses bons et sa
 * facture doit retrouver le HT au centime (Hugo, 2026-10-08,
 * `bons-et-facture-concordants.md`). L'arrondi unique pouvait en
 * différer d'un centime par ligne.
 *
 * La norme l'admet (F6-0, lu sur les sources le 2026-10-08) : le Schematron
 * CEN EN 16931 (CII) n'a aucune règle sur BT-131 = BT-129 × BT-146 ÷ BT-149 ;
 * Peppol PEPPOL-EN16931-R120 la vérifie avec une tolérance de 0,02. Les règles
 * de la plateforme de réception française n'ont pas été vérifiées. Le prix
 * net émis est rattrapé quand l'écart la dépasse (`invoice-net-price.ts`).
 *
 * ## La quantité est en millièmes dès ici
 *
 * Une ligne de bon porte des pièces ou des grammes ; la ligne de facture porte
 * `quantityThousandths` et son `unitCode` (`H87`, `KGM`). La conversion se
 * fait une fois, ligne de bon par ligne de bon (`invoiceThousandthsOf`) :
 * aucun lecteur en aval n'a à se demander ce que veut dire une quantité.
 *
 * ## Pas de prix moyen (plan `plan-remise-par-ligne.md`, § 18.6, point 3)
 *
 * Une clé ne se regroupe en UNE ligne que si Σ des montants des bons vaut
 * `lineTotalCents(prix, quantité totale)` — que le prix des bons, multiplié
 * par la quantité facturée, retombe sur le montant au centime. Sinon (trente
 * bons de 5 pièces à 0,8184 € : 30 × 4,09 € = 122,70 €, contre 122,76 € pour
 * 150 pièces), la clé rend une ligne PAR BON, chacune à son prix et à son
 * montant : jamais un prix unitaire recalculé que personne n'a payé. Le
 * total de la facture n'en bouge pas — il n'a jamais été que Σ des bons.
 *
 * La remise d'une promotion « dans le prix affiché » fait partie de la clé :
 * une ligne remisée ne se fond pas dans une ligne au même prix net sans remise.
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
  readonly unitCode: InvoiceUnitCode;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly eligible: boolean;
  readonly saleUnit: SaleUnit;
  readonly priceDiscount: InvoicePriceDiscount | undefined;
  /** La quantité dans l'unité de vente (pièces, grammes) — pour rejouer `lineTotalCents`. */
  saleAmount: number;
  quantityThousandths: number;
  ordersLineTotalCents: number;
  label: string;
  labelAt: number;
  readonly labels: Set<string>;
  firstDeliveryDate: string | null;
  lastDeliveryDate: string | null;
}

/** Une clé : la ligne regroupée, et la même découpée bon par bon. */
interface KeyGroup {
  readonly merged: LineAccumulator;
  readonly byOrder: Map<string, LineAccumulator>;
}

/**
 * Agrège les lignes des bons en lignes de facture, triées par sku, prix puis
 * taux ; une clé dont le regroupement ferait un prix moyen rend une ligne par bon.
 *
 * @throws {InvoiceDossierMixedSaleUnitError} un même sku arrive dans deux unités.
 */
export function aggregateInvoiceLines(
  orders: readonly FrozenInvoiceOrder[],
): readonly InvoiceLine[] {
  const byKey = new Map<string, KeyGroup>();
  const unitOfSku = new Map<string, SaleUnit>();
  for (const order of orders) {
    for (const line of order.lines) {
      assertOneUnit(unitOfSku, line, order.reference);
      const vatRate = normalizedVatRate(line.vatRate, order.reference);
      const eligible = line.pickupDiscountEligible ?? true;
      const key = `${line.sku}|${line.saleUnit}|${String(line.unitPriceMillicents)}|${String(vatRate)}|${String(eligible)}|${priceDiscountKey(line.priceDiscount)}`;
      const group = byKey.get(key) ?? {
        merged: openAccumulator(line, vatRate, eligible),
        byOrder: new Map<string, LineAccumulator>(),
      };
      byKey.set(key, group);
      accumulate(group.merged, order, line);
      const own = group.byOrder.get(order.reference) ?? openAccumulator(line, vatRate, eligible);
      group.byOrder.set(order.reference, own);
      accumulate(own, order, line);
    }
  }
  return [...byKey.values()]
    .sort((left, right) => compareLines(left.merged, right.merged))
    .flatMap((group) => (recomposes(group.merged) ? [group.merged] : [...group.byOrder.values()]))
    .map(closeAccumulator);
}

/** Le prix des bons × la quantité regroupée retombe-t-il sur Σ de leurs montants ? */
function recomposes(acc: LineAccumulator): boolean {
  const total = lineTotalCents(acc.unitPriceMillicents, saleQuantity(acc.saleAmount, acc.saleUnit));
  return total === acc.ordersLineTotalCents;
}

/** Un article n'a qu'une unité : la première lue fait foi pour tout le dossier. */
function assertOneUnit(
  unitOfSku: Map<string, SaleUnit>,
  line: FrozenInvoiceLine,
  orderReference: string,
): void {
  const known = unitOfSku.get(line.sku);
  if (known === undefined) {
    unitOfSku.set(line.sku, line.saleUnit);
  } else if (known !== line.saleUnit) {
    throw new InvoiceDossierMixedSaleUnitError(line.sku, orderReference);
  }
}

function openAccumulator(
  line: FrozenInvoiceLine,
  vatRate: number,
  eligible: boolean,
): LineAccumulator {
  return {
    sku: line.sku,
    unitCode: invoiceUnitCodeOf(line.saleUnit),
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate,
    eligible,
    saleUnit: line.saleUnit,
    priceDiscount: line.priceDiscount,
    saleAmount: 0,
    quantityThousandths: 0,
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
  line: FrozenInvoiceLine,
): void {
  const name = line.productNameSnapshot;
  acc.saleAmount += line.quantity;
  acc.quantityThousandths += invoiceThousandthsOf(saleQuantity(line.quantity, line.saleUnit));
  acc.ordersLineTotalCents += line.lineTotalCents;
  acc.labels.add(name);
  // À égalité d'instant, le dernier lu l'emporte : l'ordre d'entrée tranche.
  if (order.createdAt.getTime() >= acc.labelAt) {
    acc.label = name;
    acc.labelAt = order.createdAt.getTime();
  }
  // Le jour de l'envoi qui a porté la ligne (un reste, E7), sinon celui du bon.
  const date = line.deliveryDate ?? order.requestedDeliveryDate;
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
    unitCode: acc.unitCode,
    quantityThousandths: acc.quantityThousandths,
    amountCents: acc.ordersLineTotalCents,
    ordersLineTotalCents: acc.ordersLineTotalCents,
    firstDeliveryDate: acc.firstDeliveryDate,
    lastDeliveryDate: acc.lastDeliveryDate,
    ...(acc.eligible ? {} : { pickupDiscountEligible: false as const }),
    ...(acc.priceDiscount === undefined ? {} : { priceDiscount: acc.priceDiscount }),
  };
}

function compareLines(left: LineAccumulator, right: LineAccumulator): number {
  if (left.sku !== right.sku) {
    return left.sku < right.sku ? -1 : 1;
  }
  if (left.unitPriceMillicents !== right.unitPriceMillicents) {
    return left.unitPriceMillicents - right.unitPriceMillicents;
  }
  if (left.vatRate !== right.vatRate) {
    return left.vatRate - right.vatRate;
  }
  // L'éligible d'abord : c'est l'ordre d'avant les exclusions.
  return Number(right.eligible) - Number(left.eligible);
}
