import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { OrderContextStore } from '../../order-context.store';
import { ClientCopyService, fill } from '../../copy/client-copy.service';

/**
 * **Le panier en cours**, dans le bandeau de la boutique.
 *
 * Ce qui reste sous les yeux quand le détail part en tiroir : où l'on est
 * servi, combien de pièces, combien ça fait, et le geste de sortie. Trois
 * nombres et deux boutons — c'est tout ce qu'on regarde en parcourant un rayon,
 * et ça ne justifiait pas une colonne de 360 px.
 *
 * Elle remplace `OrderContextBar`, qui ne portait que la première ligne : deux
 * surfaces pour le même contexte, l'une au-dessus du rayon et l'autre à côté du
 * panier, était une de trop.
 *
 * 🔴 **Le `null` du service est un état de plein droit**, pas un trou : on
 * visite d'abord, on choisit ensuite. La carte DEMANDE alors au lieu de
 * rappeler, et rien n'est bloqué avant le règlement.
 */
@Component({
  selector: 'app-cart-banner-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-banner-card.html',
  styleUrl: './cart-banner-card.scss',
})
export class CartBannerCard {
  /** Ouvrir le tiroir : relire les lignes, les taux, la remise. */
  readonly opened = output<void>();
  /** Revenir à la question du service — « Changer », ou l'invite. */
  readonly serviceRequested = output<void>();
  readonly paid = output<void>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  private readonly order = inject(OrderContextStore);
  protected readonly choice = this.order.choice;

  protected readonly pieces = computed(() =>
    fill(this.t().shop.cartBar, { count: String(this.cart.count()) }),
  );

  protected readonly total = computed(() => formatCents(this.cart.totals().totalCents));

  protected readonly payLabel = computed(() => fill(this.t().cart.pay, { total: this.total() }));

  /** Le rappel du service, sur une ligne : « Le Labo · 7 h – 8 h ». */
  protected readonly where = computed(() => {
    const service = this.choice();
    return service === null ? '' : `${service.place} · ${service.slot}`;
  });

  /**
   * ⚠️ **MAQUETTE.** Porter la commande au compte suppose une condition de
   * règlement, qui vit sur l'entreprise et n'atteint pas cet écran : la
   * boutique est servie sans jeton, donc sans client. Le bouton dit l'intention
   * et l'écran le reconnaît — c'est mieux qu'un bouton grisé, qui ne dit ni ce
   * qu'il ferait ni pourquoi il ne le fait pas.
   */
  protected readonly accountPending = signal(false);

  protected chargeToAccount(): void {
    this.accountPending.set(true);
  }

  protected readonly mode = computed(() => {
    const service = this.choice();
    const c = this.t().cart;
    return service === null ? '' : service.mode === 'pickup' ? c.pickupGroup : c.deliveryGroup;
  });
}
