import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldCardComponent } from 'fold-ng';

import type { FeaturedCard } from '../pro-landing';

/**
 * Un incontournable de `/pro`, en carte éditoriale : grande image portrait,
 * nom en capitales d'affiche, note dessous — et TOUJOURS sans prix (Hugo,
 * 2026-10-19 : un tarif pro dépend de la société). La carte entière est un
 * seul contrôle, qui mène à la connexion : d'où `fold-card interactive`.
 */
@Component({
  selector: 'app-pro-featured-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './pro-featured-card.html',
  styleUrl: './pro-featured-card.scss',
})
export class ProFeaturedCard {
  readonly card = input.required<FeaturedCard>();
  /** Clic ou clavier sur la carte : la page ouvre la connexion. */
  readonly activated = output();
}
