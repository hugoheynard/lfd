import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

/**
 * **Le bouton du bas** d'une carte mobile de `/mon-compte` — le seul geste qu'une
 * carte porte, celui qui ouvre son panneau.
 *
 * Le pied des cartes MOBILES. Un composant plutôt qu'une règle recopiée dans
 * chacune (demande de Hugo, 2026-09-14) : pleine largeur, même emphase
 * partout, et poussé en bas par `margin-top: auto` — c'est ce qui aligne les
 * boutons de cartes que le rail étire à la même hauteur.
 */
@Component({
  selector: 'app-card-foot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './card-foot.html',
  styleUrl: './card-foot.scss',
})
export class CardFoot {
  readonly label = input.required<string>();
  /** Le geste existe mais ne peut pas aboutir — la carte dit pourquoi, au-dessus. */
  readonly disabled = input(false);
  readonly pressed = output<void>();
}
