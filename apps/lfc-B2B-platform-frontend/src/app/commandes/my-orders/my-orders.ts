import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import type {
  BillingAddressPayload,
  FulfillmentMethod,
  OrderStatus,
  OrderView,
  PaymentStatus,
} from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent } from 'fold-ng';
import {
  buildTimeline,
  canSettle,
  formatCents,
  fulfillmentLabel as sharedFulfillmentLabel,
  orderStatusLabel,
  paymentStatusLabel,
  type TimelineStep,
} from '@lfd/b2b-ui/order';

import { productById } from '../../data/catalogue-seed';

/** Une ligne retirée du gabarit récurrent (nom résolu depuis le catalogue). */
interface RemovedLine {
  readonly name: string;
  readonly quantity: number;
}

/**
 * Liste des **commandes personnelles** (zéro friction, sans entreprise). Purement
 * présentationnel : la page possède l'état (via `OrdersService`) et le passe en
 * `input`. Chaque carte se **déplie** : à gauche la **frise** d'avancement (règlement
 * → livrée), à droite la **composition** (lignes + pills récurrent / +/− vis-à-vis du
 * gabarit quand la commande vient d'un abonnement).
 */
@Component({
  selector: 'app-my-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, RouterLink],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
})
export class MyOrders {
  readonly orders = input.required<readonly OrderView[]>();

  /** « Transformer en panier récurrent » — la page ouvre le panneau avec la commande. */
  readonly makeRecurring = output<OrderView>();

  /** « Régler » — la page traite le règlement (terme ou carte en attente). */
  readonly settleOrder = output<OrderView>();

  /** Ids des commandes dépliées. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggle(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected timeline(order: OrderView): readonly TimelineStep[] {
    return buildTimeline(order);
  }

  protected settlable(status: PaymentStatus): boolean {
    return canSettle(status);
  }

  /** SKU ajoutés vs le gabarit récurrent — pour la pill « + » sur les lignes. */
  protected isAdded(order: OrderView, sku: string): boolean {
    return order.recurringDeltas?.added.some((line) => line.sku === sku) ?? false;
  }

  /** Lignes retirées vs le gabarit — rendues en pills « − » (nom résolu). */
  protected removedLines(order: OrderView): readonly RemovedLine[] {
    return (order.recurringDeltas?.removed ?? []).map((line) => ({
      name: productById(line.sku)?.name ?? line.sku,
      quantity: line.quantity,
    }));
  }

  /** L'adresse figée de l'acheminement : livraison (coursier) ou point de retrait. */
  protected fulfilAddress(order: OrderView): BillingAddressPayload | null {
    return order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : order.pickupAddress;
  }

  protected statusLabel(status: OrderStatus): string {
    return orderStatusLabel(status);
  }

  protected paymentLabel(status: PaymentStatus): string {
    return paymentStatusLabel(status);
  }

  protected fulfillmentLabel(method: FulfillmentMethod): string {
    return sharedFulfillmentLabel(method);
  }

  /** Montant TTC (centimes) → « 6,33 € ». */
  protected fmtCents(cents: number): string {
    return formatCents(cents);
  }

  /** ISO → date courte fr (« 6 août 2026 »). */
  protected fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
