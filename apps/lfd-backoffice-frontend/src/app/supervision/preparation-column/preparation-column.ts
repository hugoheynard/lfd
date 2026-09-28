import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldMeterComponent,
} from 'fold-ng';

import type { PreparationBoard, ShelfCard } from '../preparation-shelves';
import { SUPERVISION_LINKS } from '../supervision-links';

/**
 * **Colonne 1 · Préparation — l'unité est le produit.** Une carte par rayon,
 * dépliable sur toutes ses lignes — à sortir, puis sorties avec leurs
 * initiales —, listées **sans case à cocher** : cocher est le
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
    FoldDisclosureComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
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
  protected readonly empty = computed(
    () => this.board().open.length === 0 && this.board().finished.length === 0,
  );

  /**
   * Ce qui reste au four, puis les rayons finis — **visibles, en bas** (Hugo,
   * 2026-09-28). Ils se repliaient en une ligne de noms : on ne voyait plus ce
   * qui était sorti, ni en quelle quantité.
   */
  protected readonly shown = computed<readonly ShelfCard[]>(() => [
    ...this.board().open,
    ...this.board().finished,
  ]);

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
}
