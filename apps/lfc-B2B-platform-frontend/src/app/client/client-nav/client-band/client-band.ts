import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

import { ClientBanner } from '../client-banner';
import { ClientNavBar } from '../client-nav-bar/client-nav-bar';

/**
 * LA DESCENTE — ce qui relie la barre d'app au crème de la page.
 *
 * Deux étages dans une seule région, et c'est délibéré :
 *
 * - le **bandeau**, qui change avec l'écran (un titre, une action), et dont le
 *   dégradé descend de l'encre de la barre jusqu'à celle de la sous-barre ;
 * - la **sous-barre**, qui ne change jamais — mêmes cinq destinations, même
 *   ordre, partout.
 *
 * Ils sont ensemble parce que la couture est à zéro : la fin du dégradé doit
 * valoir EXACTEMENT le fond de la sous-barre. Un seul composant qui peint la
 * descente le garantit ; deux régions qui négocient un dégradé de part et
 * d'autre d'une frontière, non. Le menu n'est alors plus posé sur le bleu : il
 * est le bas de la descente.
 *
 * C'est aussi ce qui garde la navigation hors de portée des écrans. Si le
 * bandeau ET la sous-barre étaient du contenu de page, chaque écran
 * re-déclarerait les cinq destinations — et la règle qui compte (leur ordre ne
 * change jamais) ne serait plus tenue que par la relecture.
 */
@Component({
  selector: 'app-client-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientNavBar],
  templateUrl: './client-band.html',
  styleUrl: './client-band.scss',
})
export class ClientBand {
  /** ⚠️ `read: ViewContainerRef` — sans lui on récupérerait l'élément, pas le
   *  conteneur, et l'insertion n'aurait nulle part où aller. */
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  constructor() {
    const banner = inject(ClientBanner);
    effect(() => banner.slot.set(this.slot()));
  }
}
