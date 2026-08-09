import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldPopoverComponent, FoldPopoverTriggerDirective } from 'fold-ng';

/**
 * **Bulle d'aide** — le petit « i » posé en fin de ligne d'un libellé, ou dans le
 * coin d'une carte de dashboard. Au clic, révèle l'explication de ce que la
 * valeur mesure ou de ce que le réglage change.
 *
 * Bâtie sur `fold-popover` plutôt que sur une bulle positionnée à la main : le
 * panneau part dans le **top layer** natif, donc il échappe aux `overflow:
 * hidden` (une carte de graphe, une région de scroll) et à tous les `z-index` ;
 * l'`Échap`, le clic extérieur et le câblage `aria-haspopup` / `aria-expanded` /
 * `aria-controls` viennent avec.
 */
@Component({
  selector: 'app-metric-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPopoverComponent, FoldPopoverTriggerDirective],
  templateUrl: './metric-info.html',
  styleUrl: './metric-info.scss',
})
export class MetricInfo {
  /** Texte descriptif affiché dans la bulle. */
  readonly text = input.required<string>();
  /** Libellé accessible du déclencheur (nommé pour les lecteurs d'écran). */
  readonly label = input('Aide sur la métrique');
}
