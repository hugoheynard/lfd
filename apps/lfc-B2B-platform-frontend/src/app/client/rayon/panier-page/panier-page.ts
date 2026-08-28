import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { formatEuro } from '../../../client/cart-total';
import { ClientCart } from '../../../client/client-cart.service';
import { ClientChrome } from '../../../client/client-chrome.service';
import { ClientOrder } from '../../../client/client-order.service';
import { ClientOrders } from '../../../client/client-orders.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
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

  /**
   * Le bouton nomme la SUITE, et elle dépend de ce qui manque : un panier vide
   * renvoie au rayon, un panier sans mode de service renvoie à la question, et
   * un panier prêt porte le montant.
   */
  protected readonly ctaLabel = computed(() => {
    if (this.cart.isEmpty()) {
      return this.t().cart.browse;
    }
    if (this.choice() === null) {
      return this.t().shop.pickService;
    }
    return fill(this.t().cart.pay, { total: formatEuro(this.cart.totals().total) });
  });

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerCart);
    this.chrome.back.set((): void => this.backToShop());
  }

  protected pickService(): void {
    void this.router.navigate(['/nouvelle-commande']);
  }

  protected backToShop(): void {
    void this.router.navigate(['/nouvelle-commande/boutique']);
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
    // Régler exige le mode : c'est lui qui porte la remise et les frais. On mène
    // à la question plutôt que de facturer un panier sans destination.
    if (this.choice() === null) {
      void this.router.navigate(['/nouvelle-commande']);
      return;
    }
    if (this.orders.place() !== null) {
      void this.router.navigate(['/nouvelle-commande/confirmee']);
    }
  }
}
