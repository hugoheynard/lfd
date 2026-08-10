import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BillingAddressPayload, OrderLineView, OrderView } from '@lfd/contracts';
import { FoldBadgeComponent, FoldTimelineComponent, type FoldTimelineNode } from 'fold-ng';

import {
  formatCents,
  formatOrderDate,
  formatVatRate,
  fulfillmentLabel,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '../order-format';
import { buildTimeline, toTimelineNodes } from '../order-timeline';

/** Une ligne retirée du gabarit récurrent, prête à afficher. */
interface RemovedLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
}

/** Une ligne du récapitulatif de montants (le pied du tableau). */
interface TotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Le total TTC — mis en avant, et lui seul. */
  readonly strong: boolean;
}

/**
 * Le **détail d'une commande** — la même page pour le client et pour le
 * commercial.
 *
 * Partagée volontairement : quand un client appelle au sujet de sa commande, le
 * commercial doit avoir **exactement** son écran sous les yeux. Deux rendus
 * distincts, et la conversation se met à porter sur ce que chacun voit plutôt
 * que sur la commande.
 *
 * Purement présentationnel : aucun appel réseau, aucune route. Les actions
 * (régler, transformer en récurrent, changer le statut côté staff) sont
 * **projetées** dans le slot `[actions]` — elles n'ont rien de commun entre les
 * deux côtés, et c'est la seule chose qui diffère.
 */
@Component({
  selector: 'lfd-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldTimelineComponent],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
})
export class OrderDetail {
  readonly order = input.required<OrderView>();

  /**
   * Noms de produits par SKU, pour les lignes **retirées** d'une échéance
   * récurrente. Elles ne portent qu'un SKU (elles ne figurent pas dans la
   * commande), donc rien d'autre ne peut les nommer. À défaut, le SKU s'affiche
   * tel quel — laid mais vrai, ce qui vaut mieux qu'une ligne muette.
   */
  readonly nameBySku = input<ReadonlyMap<string, string>>(new Map());

  /**
   * La frise, en nœuds `fold-timeline`. Le rail, les points, la barre de
   * progression et le libellé de progression appartiennent au composant fold ;
   * on ne lui projette que la zone de libellé, pour teinter l'échec et mettre en
   * retrait les jalons que rien ne suit encore.
   */
  protected readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    toTimelineNodes(buildTimeline(this.order())),
  );

  protected readonly statusLabel = computed(() => orderStatusLabel(this.order().status));
  protected readonly statusVariant = computed(() => orderStatusVariant(this.order().status));
  protected readonly paymentLabel = computed(() => paymentStatusLabel(this.order().paymentStatus));
  protected readonly paymentVariant = computed(() =>
    paymentStatusVariant(this.order().paymentStatus),
  );
  protected readonly fulfillment = computed(() => fulfillmentLabel(this.order().fulfillmentMethod));

  /** L'adresse figée de l'acheminement : celle du coursier, ou celle du retrait. */
  protected readonly address = computed<BillingAddressPayload | null>(() => {
    const order = this.order();
    return order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : order.pickupAddress;
  });

  /**
   * Le récapitulatif des montants. Remise et livraison ne sont **rendues que si
   * elles existent** : une ligne « Remise 0,00 € » invite à chercher une remise
   * qu'on n'a pas eue.
   */
  protected readonly totals = computed<readonly TotalRow[]>(() => {
    const order = this.order();
    const rows: TotalRow[] = [
      {
        key: 'subtotal',
        label: 'Sous-total HT',
        value: formatCents(order.subtotalCents),
        strong: false,
      },
    ];
    if (order.discountCents > 0) {
      rows.push({
        key: 'discount',
        label: 'Remise',
        value: `− ${formatCents(order.discountCents)}`,
        strong: false,
      });
    }
    if (order.deliveryFeeCents > 0) {
      rows.push({
        key: 'delivery',
        label: 'Livraison HT',
        value: formatCents(order.deliveryFeeCents),
        strong: false,
      });
    }
    rows.push({ key: 'vat', label: 'TVA', value: formatCents(order.vatCents), strong: false });
    rows.push({
      key: 'total',
      label: 'Total TTC',
      value: formatCents(order.totalCents),
      strong: true,
    });
    return rows;
  });

  /** SKU ajoutés pour cette échéance vis-à-vis du gabarit récurrent. */
  protected readonly addedSkus = computed<ReadonlySet<string>>(
    () => new Set((this.order().recurringDeltas?.added ?? []).map((line) => line.sku)),
  );

  protected readonly removed = computed<readonly RemovedLine[]>(() =>
    (this.order().recurringDeltas?.removed ?? []).map((line) => ({
      sku: line.sku,
      name: this.nameBySku().get(line.sku) ?? line.sku,
      quantity: line.quantity,
    })),
  );

  protected isAdded(line: OrderLineView): boolean {
    return this.addedSkus().has(line.sku);
  }

  protected fmtCents(cents: number): string {
    return formatCents(cents);
  }

  protected fmtVat(rate: number): string {
    return formatVatRate(rate);
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
