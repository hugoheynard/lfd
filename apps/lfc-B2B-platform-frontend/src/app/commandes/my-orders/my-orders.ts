import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { FulfillmentMethod, OrderStatus, OrderView, PaymentStatus } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { formatEurValue } from '../../data/catalogue-seed';

const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  draft: 'Brouillon',
  placed: 'Passée',
  confirmed: 'Confirmée',
  in_production: 'En production',
  fulfilled: 'Livrée',
  cancelled: 'Annulée',
};

const PAYMENT_LABELS: Readonly<Record<PaymentStatus, string>> = {
  not_required: 'À facturer',
  pending: 'Paiement en attente',
  paid: 'Payée',
  failed: 'Paiement échoué',
  refunded: 'Remboursée',
};

const FULFILLMENT_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Coursier',
  pickup: 'Retrait au labo',
};

/**
 * Liste des **commandes personnelles** (zéro friction, sans entreprise). Purement
 * présentationnel : la page possède l'état (via `OrdersService`) et le passe en
 * `input`. Une carte par commande — numéro, date, acheminement, état, total TTC.
 */
@Component({
  selector: 'app-my-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
})
export class MyOrders {
  readonly orders = input.required<readonly OrderView[]>();

  /** « Transformer en panier récurrent » — la page ouvre le panneau avec la commande. */
  readonly makeRecurring = output<OrderView>();

  protected statusLabel(status: OrderStatus): string {
    return STATUS_LABELS[status];
  }

  protected paymentLabel(status: PaymentStatus): string {
    return PAYMENT_LABELS[status];
  }

  protected fulfillmentLabel(method: FulfillmentMethod): string {
    return FULFILLMENT_LABELS[method];
  }

  /** Montant TTC (centimes) → « 6,33 € ». */
  protected fmtCents(cents: number): string {
    return formatEurValue(cents / 100);
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
