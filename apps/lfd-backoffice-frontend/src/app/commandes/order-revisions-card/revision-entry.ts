import {
  formatCents,
  formatMillicents,
  formatOrderDate,
  formatOrderInstant,
  formatVatRate,
} from '@lfd/b2b-ui/order';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import type { OrderRevisionEntryView, ReplacedCompositionView } from '@lfd/contracts';

import { ORDER_REVISION_CHANGE } from '../../shared/journal/values/orders-values';

/** Une ligne de la composition remplacée, prête à lire. */
export interface ReplacedLineRow {
  readonly sku: string;
  readonly name: string;
  /** Des pièces, ou des grammes au poids. */
  readonly quantity: number;
  /** La quantité dite : « 10 », ou « 1,25 kg » au poids (P5). */
  readonly quantityLabel: string;
  readonly unitPrice: string;
  readonly vat: string;
  readonly total: string;
}

/** La composition remplacée, prête à lire ; `null` quand le serveur n'a pas pu la relire. */
export interface ReplacedRows {
  readonly route: string;
  readonly when: string;
  readonly note: string | null;
  readonly lines: readonly ReplacedLineRow[];
  readonly total: string;
}

/** Une modification, prête à lire : qui, quand, l'écart, ce qui a changé. */
export interface RevisionRow {
  readonly key: string;
  /** « Version 1 » : la révision remplacée, comptée depuis la passation (0 = « Version d'origine »). */
  readonly title: string;
  readonly meta: string;
  readonly difference: string;
  readonly changes: string;
  readonly replaced: ReplacedRows | null;
}

/**
 * **Une version précédente, dite** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) — pur, pour
 * être éprouvé sans monter la carte.
 */
export function revisionRowOf(entry: OrderRevisionEntryView): RevisionRow {
  const who = entry.author.name ?? 'personne inconnue';
  const role = entry.author.kind === 'staff' ? 'l’équipe' : 'le client';
  return {
    key: String(entry.replacedRevision),
    title:
      entry.replacedRevision === 0
        ? 'Version d’origine'
        : `Version ${String(entry.replacedRevision)}`,
    meta: `Remplacée le ${formatOrderInstant(entry.revisedAt)}, par ${who} (${role})`,
    difference: differenceOf(entry.totalAfterCents - entry.totalBeforeCents),
    changes: entry.changes
      .map((change) => ORDER_REVISION_CHANGE.labels[change] ?? change)
      .join(', '),
    replaced: entry.replaced === null ? null : replacedRowsOf(entry.replaced),
  };
}

function differenceOf(cents: number): string {
  if (cents === 0) {
    return 'Total inchangé';
  }
  return `${cents > 0 ? '+' : '−'} ${formatCents(Math.abs(cents))}`;
}

function replacedRowsOf(replaced: ReplacedCompositionView): ReplacedRows {
  return {
    route: routeOf(replaced),
    when: whenOf(replaced),
    note: replaced.note.trim() === '' ? null : replaced.note,
    lines: replaced.lines.map((line) => ({
      sku: line.sku,
      name: line.productName,
      quantity: line.quantity,
      quantityLabel: saleQuantityLabel(line.quantity, line.saleUnit),
      // Au poids, le prix figé est au kilo (`plan-vente-au-poids.md`, P5).
      unitPrice: `${formatMillicents(line.unitPriceMillicents)} HT${line.saleUnit === 'weight' ? ' / kg' : ''}`,
      vat: formatVatRate(line.vatRate),
      total: `${formatCents(line.lineTotalCents)} HT`,
    })),
    total: formatCents(replaced.totalCents),
  };
}

function routeOf(replaced: ReplacedCompositionView): string {
  const address =
    replaced.fulfillmentMethod === 'pickup' ? replaced.pickupAddress : replaced.deliveryAddress;
  const place =
    address === null
      ? ''
      : [address.label, `${address.ligne1}, ${address.codePostal} ${address.ville}`]
          .filter((part) => part.trim() !== '')
          .join(' — ');
  // Pas `fulfillmentLabel` : il dit « au laboratoire », et le point est nommé à côté.
  const mode = replaced.fulfillmentMethod === 'pickup' ? 'Retrait' : 'Livraison';
  return place === '' ? mode : `${mode} : ${place}`;
}

function whenOf(replaced: ReplacedCompositionView): string {
  const day =
    replaced.requestedDeliveryDate === null
      ? 'sans jour'
      : formatOrderDate(replaced.requestedDeliveryDate);
  const window = replaced.window;
  if (window === null) {
    return day;
  }
  const slot = window.start === null ? `avant ${window.end}` : `${window.start} – ${window.end}`;
  return `${day}, ${slot}`;
}
