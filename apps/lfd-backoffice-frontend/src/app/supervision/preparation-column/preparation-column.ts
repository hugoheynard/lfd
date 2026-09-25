import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldMeterComponent,
} from 'fold-ng';

import type { PreparationBoard, ShelfCard } from '../preparation-shelves';
import { SUPERVISION_LINKS } from '../supervision-links';

/**
 * **Colonne 1 · Préparation — l'unité est le produit.** Une carte par rayon,
 * les lignes encore à sortir listées **sans case à cocher** : cocher est le
 * geste de la fournée, et la Supervision n'agit pas (plan §1). Le renvoi
 * « Ouvrir la fournée » n'est montré qu'à qui peut l'ouvrir.
 */
@Component({
  selector: 'app-preparation-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldMeterComponent,
  ],
  templateUrl: './preparation-column.html',
  styleUrl: './preparation-column.scss',
})
export class PreparationColumn {
  readonly board = input.required<PreparationBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);

  protected readonly link = SUPERVISION_LINKS.preparation;
  /** Mobile : les rayons finis se déplient au pied de la colonne. */
  protected readonly unfolded = signal(false);

  protected readonly empty = computed(
    () => this.board().open.length === 0 && this.board().finished.length === 0,
  );

  /** Ce qui reste au four, puis — en mobile, déplié — les rayons finis. */
  protected readonly shown = computed<readonly ShelfCard[]>(() => {
    const board = this.board();
    return this.narrow() && this.unfolded() ? [...board.open, ...board.finished] : board.open;
  });

  protected readonly finishedNames = computed(() =>
    this.board()
      .finished.map((card) => card.label)
      .join(', '),
  );

  protected meterLabel(card: ShelfCard): string {
    return card.state === 'done'
      ? `Rayon terminé · ${String(card.totalUnits)} pièces sorties`
      : `${String(card.remainingUnits)} pièces restantes`;
  }

  protected meterTone(card: ShelfCard): 'success' | 'warning' | 'accent' {
    if (card.state === 'done') {
      return 'success';
    }
    return card.state === 'in_progress' ? 'warning' : 'accent';
  }

  protected toggle(): void {
    this.unfolded.update((open) => !open);
  }
}
