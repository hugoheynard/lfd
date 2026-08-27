import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { formatEuro } from '../../client/cart-total';
import { ClientCart } from '../../client/client-cart.service';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientOrder } from '../../client/client-order.service';
import { ClientOrders } from '../../client/client-orders.service';
import { ClientCopyService, fill } from '../../client/copy/client-copy.service';
import { CartSummary } from '../cart-summary/cart-summary';

/**
 * Le panier, en pile — ce que le bureau montre dans sa colonne de droite.
 *
 * Il ne redemande rien : le lieu et le créneau sont déjà pris, ils se rappellent
 * en tête de page. Le seul geste qui reste est de régler, et le bouton porte le
 * montant plutôt que de le laisser deviner.
 */
@Component({
  selector: 'app-panier-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartSummary],
  templateUrl: './panier-page.html',
  styleUrl: './panier-page.scss',
})
export class PanierPage {
  private readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly order = inject(ClientOrder);
  private readonly orders = inject(ClientOrders);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  protected readonly choice = this.order.choice;

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatEuro(this.cart.totals().total) }),
  );

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerCart);
    this.chrome.back.set((): void => this.backToShop());
    effect(() => {
      // Sans mode de service, il n'y a pas de panier à relire : on renvoie à la
      // question, comme le rayon le fait.
      if (this.order.choice() === null) {
        void this.router.navigate(['/commande']);
      }
    });
  }

  protected backToShop(): void {
    void this.router.navigate(['/commande/boutique']);
  }

  /**
   * ⚠️ Maquette : la commande est FIGÉE DANS LE NAVIGATEUR, aucun paiement n'est
   * demandé et rien n'est écrit en base. C'est ici que le vrai règlement se
   * branchera, et nulle part ailleurs.
   */
  protected proceed(): void {
    if (this.cart.isEmpty()) {
      this.backToShop();
      return;
    }
    if (this.orders.place() !== null) {
      void this.router.navigate(['/commande/confirmee']);
    }
  }
}
