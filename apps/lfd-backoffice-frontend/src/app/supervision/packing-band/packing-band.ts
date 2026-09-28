import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FoldListboxComponent } from 'fold-ng';

import { ALL_POINTS, type PackingBoard, pointFilterOptions } from '../packing-cards';

/**
 * **La bande de la colonne 2** (Supervision v2, A4) : le repère « Par heure
 * de remise » et le filtre « Tous les points ▾ ». Elle vit sous l'en-tête de
 * colonne, hors du corps qui défile — d'où un composant à part, projeté par la
 * page dans le slot `columnBand`, qui partage son filtre avec la colonne.
 */
@Component({
  selector: 'app-packing-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent],
  templateUrl: './packing-band.html',
  styleUrl: './packing-band.scss',
})
export class PackingBand {
  readonly board = input.required<PackingBoard>();
  /** Le point retenu — `[(point)]`, partagé avec `app-packing-column` ; `''` = tous. */
  readonly point = model<string>(ALL_POINTS);

  protected readonly options = computed(() => pointFilterOptions(this.board()));
  /** Le nombre de commandes de chaque entrée, pour le compte à droite du menu. */
  protected readonly counts = computed(
    () => new Map(this.options().map((option) => [option.value, option.count])),
  );
  protected readonly active = computed(() => this.point() !== ALL_POINTS);
}
