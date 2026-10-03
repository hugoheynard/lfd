import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { RowTab } from '../delivery-loading-tiles';

/**
 * **Le plancher vu de dessus, rétrogradé en sélecteur de rangée** — une
 * vignette par rangée, du fond (la cloison, à gauche) vers les portes (à
 * droite), chacune avec son avancement et la mini-carte de ses bacs : pleins
 * = chargés, pointillés = à charger, cerclé = le prochain.
 *
 * Le composant ne choisit rien : il dit quelle rangée on touche, et l'écran
 * décide combien de temps elle reste ouverte.
 */
@Component({
  selector: 'app-loading-row-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-row-picker.html',
  styleUrl: './loading-row-picker.scss',
})
export class LoadingRowPicker {
  readonly tabs = input.required<readonly RowTab[]>();
  /** La rangée affichée. */
  readonly selected = input<number | null>(null);
  readonly size = input<'phone' | 'depot'>('phone');

  readonly selectedChange = output<number>();
}
