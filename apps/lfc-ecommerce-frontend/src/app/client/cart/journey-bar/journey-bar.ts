import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { OrderContextStore } from '../../order-context.store';
import { OrderDoors } from '../../shop/order-doors';
import { CartBar } from '../cart-bar/cart-bar';

/** La boutique : c'est là que « Régler » s'enchaîne, et elle a sa propre barre. */
const SHOP = '/boutique';

/**
 * **La barre du panier hors de la boutique** (plan
 * `documentation/commandes/passation/plan-barre-qui-accompagne.md`, §2.2).
 *
 * Le shell la monte dès qu'un brouillon ou un choix existe, ailleurs que sur
 * la boutique — qui garde la sienne. Elle tranche ce que `CartBar` émet :
 * reprendre le parcours, revenir sur le service retenu, et « Régler », qui
 * mène à la boutique où le règlement s'enchaîne.
 *
 * Au bureau, elle ne parle que PENDANT le parcours : une fois le choix
 * complet, la barre « Ma commande » du haut de la boutique reste celle qui le
 * dit (`settled`, masqué au-delà du pli).
 */
@Component({
  selector: 'app-journey-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.settled]': 'settled()' },
  imports: [CartBar],
  templateUrl: './journey-bar.html',
  styleUrl: './journey-bar.scss',
})
export class JourneyBar {
  private readonly store = inject(OrderContextStore);
  private readonly doors = inject(OrderDoors);
  private readonly router = inject(Router);

  /** Plus de brouillon : le parcours est fini. */
  protected readonly settled = computed(() => this.store.draft() === null);

  protected resume(): void {
    void this.doors.resume();
  }

  protected pay(): void {
    void this.router.navigateByUrl(SHOP);
  }

  /** Comme le « Modifier » de la boutique : l'heure de la maison, ou l'adresse. */
  protected edit(): void {
    const service = this.store.choice();
    if (service === null) {
      void this.doors.choose();
    } else if (service.mode === 'delivery') {
      void this.doors.delivery(service.deliveryAddressId, service.date);
    } else if (service.pickupAddressId !== null) {
      void this.doors.time(service.pickupAddressId, service.place, service.address);
    } else {
      void this.doors.pickup(null);
    }
  }
}
