import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

import { ClientBanner } from '../client-banner';
import { ClientChrome } from '../../client-chrome.service';

/**
 * LA DESCENTE — ce qui relie la barre d'app au crème de la page.
 *
 * Elle porte le **bandeau**, qui change avec l'écran (un titre, une action), et
 * le dégradé qui descend de l'encre de la barre jusqu'au bord de la feuille.
 * Vide, elle se replie : la bande n'a alors aucune hauteur.
 *
 * 🔴 **La sous-barre du bureau en est partie le 2026-09-20** (maquette
 * `handoff-accueil-pro`). Les six destinations vivent dans le popover
 * d'identité, qui les lit sur la même source — `ClientNav` — et dans le même
 * ordre. Ce qui reste ici est la peinture du raccord, et rien d'autre : c'est
 * pour elle que la descente et la lèvre sont dans un seul composant, la fin du
 * dégradé devant valoir exactement le haut de ce qui suit.
 */
@Component({
  selector: 'app-client-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.narrow-in-page]': '!chrome.bandNarrow()' },
  templateUrl: './client-band.html',
  styleUrl: './client-band.scss',
})
export class ClientBand {
  /** La lèvre et le repli se lisent sur le chrome de l'écran courant. */
  protected readonly chrome = inject(ClientChrome);

  /** ⚠️ `read: ViewContainerRef` — sans lui on récupérerait l'élément, pas le
   *  conteneur, et l'insertion n'aurait nulle part où aller. */
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });

  constructor() {
    const banner = inject(ClientBanner);
    effect(() => banner.slot.set(this.slot()));
  }
}
