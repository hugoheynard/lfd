import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

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
 * En mobile seulement (Hugo, 2026-10-27) : au bureau, la barre ne paraît que
 * pendant un dialogue du parcours, qui monte la sienne (`docked`) ; hors
 * dialogue, la barre « Ma commande » du haut de la boutique dit le choix.
 */
@Component({
  selector: 'app-journey-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartBar],
  templateUrl: './journey-bar.html',
  styleUrl: './journey-bar.scss',
})
export class JourneyBar {
  private readonly doors = inject(OrderDoors);
  private readonly router = inject(Router);

  protected resume(): void {
    void this.doors.resume();
  }

  protected pay(): void {
    void this.router.navigateByUrl(SHOP);
  }

  /** « Modifier » : le panneau qui demande ce qu'on change, comme partout. */
  protected edit(): void {
    void this.doors.modify();
  }
}
