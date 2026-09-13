import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { OrderView } from '@lfd/contracts';
import { FoldButtonComponent, FoldPageLayoutComponent } from 'fold-ng';

import { OrderViewComponent } from '../order-view/order-view';

/**
 * **Une commande, en pleine page** — le cadre, et rien d'autre.
 *
 * Le corps vit dans `app-order-view`, parce que l'espace d'un compte l'affiche
 * aussi, sous SON bandeau. Cette page reste la route de premier niveau : c'est
 * la seule qui couvre les commandes « zéro friction », qui n'ont pas
 * d'entreprise, donc pas de fiche où les loger.
 */
@Component({
  selector: 'app-admin-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldPageLayoutComponent, OrderViewComponent],
  templateUrl: './commande-page.html',
  styleUrl: './commande-page.scss',
})
export class AdminCommandePage {
  /** L'identifiant de la commande, lié depuis le segment de route. */
  readonly orderId = input.required<string>();

  private readonly router = inject(Router);

  private readonly order = signal<OrderView | null>(null);

  /** La RÉFÉRENCE dans le bandeau : c'est elle qu'on dicte au téléphone. */
  protected readonly title = computed(() => this.order()?.orderNumber ?? 'Commande');

  protected onLoaded(order: OrderView): void {
    this.order.set(order);
  }

  protected async back(): Promise<void> {
    await this.router.navigate(['/commercial/comptes-clients']);
  }
}
