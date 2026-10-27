import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { instantToLocal } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { serviceDayLabel, serviceWhenLabel } from '../../format-day';
import { shownCartTotalLabel } from '../shown-cart-total';
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
 *
 * 🔴 **Il ACCOMPAGNE le parcours** (plan `documentation/commandes/passation/
 * plan-barre-qui-accompagne.md`) : tant qu'un brouillon existe
 * (`OrderContextStore.draft`), il dit ce qui est déjà répondu — mode, maison,
 * jour — et son geste nomme l'étape qui manque (« Choisissez le jour »,
 * « … l'heure », « … l'adresse ») au lieu de « Régler ». Le brouillon prime
 * sur le choix : on est en train de le refaire.
 *
 * `docked` : monté dans le PIED d'un dialogue du parcours. L'étape se fait
 * dans le dialogue même — un clic sur un jour ou une heure avance —, le geste
 * n'y est donc qu'un état, inactif ; et sans brouillon, rien ne s'y montre.
 */
@Component({
  selector: 'app-cart-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.docked]': 'docked()' },
  imports: [FoldButtonComponent],
  templateUrl: './cart-bar.html',
  styleUrl: './cart-bar.scss',
})
export class CartBar {
  /** Régler — l'écran sait ce que ça demande encore. */
  readonly pay = output<void>();

  /** Revenir sur le service retenu (plan lot 3 : retour à l'accueil). */
  readonly edit = output<void>();

  /** Reprendre le parcours à l'étape qui manque. */
  readonly resume = output<void>();

  /** Dans le pied d'un dialogue du parcours : le geste n'est qu'un état. */
  readonly docked = input(false, { transform: booleanAttribute });

  private readonly cart = inject(ClientCart);
  private readonly locale = inject(ClientLocale);

  protected readonly c = screenCopy('commandTerms', commandTermsCopy);

  private readonly store = inject(OrderContextStore);

  protected readonly choice = this.store.choice;

  /**
   * Le parcours en cours, tel que la barre le dit : `null` sans brouillon.
   * `promise` vide = ni maison ni jour encore ; `mode` `null` = pas encore dit.
   */
  protected readonly step = computed(() => {
    const draft = this.store.draft();
    if (draft === null) {
      return null;
    }
    const copy = this.c();
    const day =
      draft.date === undefined
        ? null
        : serviceDayLabel(draft.date, instantToLocal(new Date()).day, this.locale.current(), {
            today: copy.today,
            tomorrow: copy.tomorrow,
          });
    const promise = [draft.place ?? null, day].filter((part) => part !== null).join(' · ');
    const mode =
      draft.mode === undefined ? null : draft.mode === 'delivery' ? copy.delivery : copy.pickup;
    const prompt =
      draft.date === undefined
        ? copy.chooseDay
        : draft.mode === 'delivery'
          ? copy.chooseAddress
          : copy.chooseTime;
    return { mode, promise, prompt };
  });

  protected readonly count = this.cart.count;

  /** Le total du DEVIS, remise déduite — celui que la barre du bureau montre. */
  /** Le même total que « Régler » au bureau : HT au compte, TTC sinon, base écrite. */
  protected readonly total = shownCartTotalLabel();

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
