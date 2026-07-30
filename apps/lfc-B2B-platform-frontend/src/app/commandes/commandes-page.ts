import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import type { OrderStatus, OrderView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  type FoldBadgeVariant,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageLayoutComponent,
  FoldSelectComponent,
} from 'fold-ng';

import { AccountService } from '../account/account.service';
import { OrdersService } from '../orders/orders.service';

/** Libellé + ton du badge de statut, dans le langage du client. */
const STATUS: Record<OrderStatus, { readonly label: string; readonly variant: FoldBadgeVariant }> = {
  draft: { label: 'Brouillon', variant: 'neutral' },
  placed: { label: 'Passée', variant: 'info' },
  confirmed: { label: 'Confirmée', variant: 'info' },
  in_production: { label: 'En production', variant: 'warning' },
  fulfilled: { label: 'Livrée', variant: 'success' },
  cancelled: { label: 'Annulée', variant: 'alert' },
};

/**
 * Mes commandes — le carnet de commandes de l'entreprise sélectionnée, branché
 * sur l'API commandes (`GET /companies/:id/orders`). Une seule entreprise → pas
 * de sélecteur ; plusieurs → on choisit laquelle.
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCalloutComponent,
    FoldSelectComponent,
    FoldCardComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {
  private readonly account = inject(AccountService);
  private readonly orders = inject(OrdersService);

  protected readonly companies = this.account.companies;
  protected readonly companyId = signal('');
  protected readonly list = this.orders.orders;

  protected readonly hasCompany = computed(() => this.companies().length > 0);

  constructor() {
    // Sélectionne la 1ʳᵉ entreprise dès qu'elle est connue (et charge ses commandes).
    effect(() => {
      const companies = this.companies();
      if (this.companyId() === '' && companies.length > 0 && companies[0]) {
        this.select(companies[0].id);
      }
    });
  }

  protected select(id: string): void {
    this.companyId.set(id);
    if (id !== '') {
      this.orders.loadOrders(id);
    }
  }

  protected statusLabel(status: OrderStatus): string {
    return STATUS[status].label;
  }

  protected statusVariant(status: OrderStatus): FoldBadgeVariant {
    return STATUS[status].variant;
  }

  /** Centimes → « 12,50 € ». */
  protected euros(cents: number): string {
    return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;
  }

  /** ISO → « 30/07/2026 ». */
  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }

  protected itemCount(order: OrderView): number {
    return order.lines.reduce((sum, line) => sum + line.quantity, 0);
  }
}
