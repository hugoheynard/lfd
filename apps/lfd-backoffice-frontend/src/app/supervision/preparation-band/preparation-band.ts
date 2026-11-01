import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FoldListboxComponent, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

import type { PreparationView } from '../preparation-slots/preparation-slots';
import { ALL_SHELVES, type PreparationBoard, shelfFilterOptions } from '../preparation-shelves';

/**
 * **La bande de la colonne 1** (Supervision v2, A4) : le repère « À sortir
 * d'abord », la bascule Par rayon / Par tranche et, par rayon, le filtre
 * « Tous les rayons ▾ ». Elle vit sous l'en-tête de
 * colonne, hors du corps qui défile — d'où un composant à part, projeté dans
 * le slot `columnBand` de la coque, qui partage son filtre avec la colonne.
 */
@Component({
  selector: 'app-preparation-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent, FoldViewToggleComponent],
  templateUrl: './preparation-band.html',
  styleUrl: './preparation-band.scss',
})
export class PreparationBand {
  readonly board = input.required<PreparationBoard>();
  /** Le rayon retenu — `[(filter)]`, partagé avec `app-preparation-column`. */
  readonly filter = model<string>(ALL_SHELVES);
  /** Par rayon (défaut) ou par tranche — `[(view)]`, que la page lit (Hugo, 2026-11-01). */
  readonly view = model<PreparationView>('shelves');

  protected readonly views: readonly FoldViewToggleOption[] = [
    { value: 'shelves', label: 'Par rayon' },
    { value: 'slots', label: 'Par tranche' },
  ];

  protected setView(value: string): void {
    this.view.set(value === 'slots' ? 'slots' : 'shelves');
  }

  protected readonly options = computed(() => shelfFilterOptions(this.board()));
  /** Le nombre de lignes de chaque entrée, pour le compte à droite du menu. */
  protected readonly counts = computed(
    () => new Map(this.options().map((option) => [option.value, option.count])),
  );
  protected readonly active = computed(() => this.filter() !== ALL_SHELVES);
}
