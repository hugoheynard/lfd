import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { instantToLocal } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { serviceWhenLabel } from '../../format-day';
import { formatCents } from '../../format-money';
import { OrderContextStore } from '../../order-context.store';
import { ClientCart } from '../client-cart.service';

/**
 * **Le pied collé** de la boutique (handoff boutique, SPEC §8 ; plan
 * « boutique pro — cartes et fiche », lot 3).
 *
 * En pile, c'est LUI qui porte la commande : la barre « Ma commande » du
 * bandeau n'y est pas rendue — elle flottait seule sur l'encre. Il est donc là
 * dès la boutique ouverte, panier vide compris ; c'est l'écran qui décide où
 * il se montre (au bureau, seulement quand la barre manque et que le panier a
 * quelque chose).
 *
 * Deux lignes :
 * - le service retenu, et « Modifier » — absente sans choix, pour la même
 *   raison que la barre : ne pas avoir choisi n'est pas un manque ;
 * - « Régler », le compte à gauche, le total à droite. Vide, le bouton se
 *   désactive en pastille : il dit l'état au lieu de disparaître.
 *
 * Il ne décide pas de ce que « régler » ou « modifier » veulent dire : il
 * émet, et l'écran tranche (service manquant, invité, passation).
 */
@Component({
  selector: 'app-cart-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './cart-bar.html',
  styleUrl: './cart-bar.scss',
})
export class CartBar {
  /** Régler — l'écran sait ce que ça demande encore. */
  readonly pay = output<void>();

  /** Revenir sur le service retenu (plan lot 3 : retour à l'accueil). */
  readonly edit = output<void>();

  private readonly cart = inject(ClientCart);
  private readonly locale = inject(ClientLocale);

  protected readonly c = computed(() => commandTermsCopy(this.locale.current()));

  protected readonly choice = inject(OrderContextStore).choice;

  protected readonly count = this.cart.count;

  /** Le total du DEVIS, remise déduite — celui que la barre du bureau montre. */
  protected readonly total = computed(() => formatCents(this.cart.totals().totalCents));

  /** « demain 7 h 15 » — même lecture que la barre « Ma commande ». */
  protected readonly when = computed(() => {
    const service = this.choice();
    if (service === null) {
      return '';
    }
    const copy = this.c();
    return serviceWhenLabel(
      service.date,
      service.slot,
      instantToLocal(new Date()).day,
      this.locale.current(),
      { today: copy.today, tomorrow: copy.tomorrow },
    );
  });
}
