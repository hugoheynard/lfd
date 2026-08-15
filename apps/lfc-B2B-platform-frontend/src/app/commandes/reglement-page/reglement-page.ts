import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type { OrderPaymentIntent } from '@lfd/contracts';

import { StripePayment } from '../../orders/stripe-payment/stripe-payment';
import { OrdersService } from '../orders.service';

/** Où en est la page. `settled` = plus rien à régler, et c'est une bonne nouvelle. */
type PageState = 'loading' | 'ready' | 'settled' | 'error';

/**
 * **Régler une commande laissée en attente** — la cible du lien que l'équipe
 * transmet après avoir saisi une commande au téléphone.
 *
 * Une page et non une étape de checkout : on y arrive par un lien collé dans un
 * SMS ou dicté, souvent des heures après l'appel, et sans panier. Elle ne fait
 * donc qu'une chose — demander au serveur de quoi payer, monter le Payment
 * Element, et renvoyer vers la commande.
 *
 * **Une commande qui n'attend rien n'est pas une erreur.** Déjà réglée, ou
 * portée au compte : la page le dit et propose d'aller voir la commande. Un
 * écran d'erreur ferait croire à une panne à quelqu'un dont tout va bien.
 */
@Component({
  selector: 'app-reglement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    RouterLink,
    StripePayment,
  ],
  templateUrl: './reglement-page.html',
  styleUrl: './reglement-page.scss',
})
export class ReglementPage {
  readonly id = input.required<string>();

  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);

  protected readonly state = signal<PageState>('loading');
  protected readonly payment = signal<OrderPaymentIntent | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(orderId: string): Promise<void> {
    this.state.set('loading');
    try {
      this.payment.set(await this.orders.paymentFor(orderId));
      this.state.set('ready');
    } catch (error) {
      // 409 = la commande n'attend aucun règlement. Tout le reste est une vraie
      // panne : les confondre alarmerait un client dont la commande va bien.
      this.state.set(isConflict(error) ? 'settled' : 'error');
    }
  }

  /**
   * Stripe a confirmé côté navigateur. On renvoie vers la commande — c'est le
   * **webhook** qui fait autorité sur l'état payé, et c'est la commande qui le
   * montrera quand il sera arrivé.
   */
  protected async onPaid(): Promise<void> {
    await this.router.navigate(['/commandes', this.id()]);
  }
}

/** Le refus métier du serveur (409), distingué d'une panne. */
function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 409;
}
