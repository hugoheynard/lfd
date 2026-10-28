import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldCardComponent } from 'fold-ng';

import { HouseMark } from '../../shop/house-mark/house-mark';
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
  imports: [FoldCardComponent, HouseMark],
  templateUrl: './pro-featured-card.html',
  styleUrl: './pro-featured-card.scss',
})
export class ProFeaturedCard {
  readonly card = input.required<FeaturedCard>();
  /**
   * Le prix déjà mis en forme, assiette comprise (« 3,20 € TTC »). Absent sur
   * `/pro`, où aucun prix ne se montre ; posé par l'accueil `/bienvenue`, qui
   * connaît le tarif de son lecteur.
   */
  readonly price = input<string | null>(null);
  /** Clic ou clavier sur la carte : la page ouvre la connexion. */
  readonly activated = output();
}
