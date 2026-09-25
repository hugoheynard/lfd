import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import type { ColumnState } from '../column-state';

/**
 * **Le cadre d'une colonne de la Supervision** : son intitulé (« 1 ·
 * Préparation », « L'UNITÉ EST LE PRODUIT », la phrase qui dit ce qu'on y lit),
 * et SES états — chaque colonne a le sien (plan §9).
 *
 * L'en-tête reste en place, SEUL le corps défile : chaque colonne a son propre
 * défilement, et la page n'en a pas. Le contenu est projeté : ce cadre ne sait rien de ce qu'il encadre. Les trois
 * états passent par fold — `fold-loading`, `fold-empty-state` d'alerte avec
 * « Réessayer », `fold-callout` quand une relecture échoue sur un contenu déjà
 * affiché.
 */
@Component({
  selector: 'app-supervision-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './supervision-column.html',
  styleUrl: './supervision-column.scss',
})
export class SupervisionColumn {
  /** « 1 · Préparation ». */
  readonly heading = input.required<string>();
  /** « l'unité est le produit » — mis en capitales par le style. */
  readonly unit = input.required<string>();
  readonly description = input.required<string>();
  readonly state = input.required<ColumnState<unknown>>();
  readonly loadingMessage = input.required<string>();
  readonly errorTitle = input.required<string>();

  readonly retry = output();

  /** Une relecture a échoué : le contenu reste, et la colonne le dit. */
  protected readonly stale = computed(() => {
    const state = this.state();
    return state.status === 'ready' && state.stale;
  });
}
