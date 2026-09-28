import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInfoComponent,
  FoldLoadingStateComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import type { ColumnState } from '../column-state';
import { countLabel } from '../supervision-labels';
import type { SupervisionFocus } from '../supervision-search';
import type { ColumnBlocker } from '../supervision-tabs';

/**
 * **Le cadre d'une colonne de la Supervision** : son en-tête, sa bande, et SES
 * états — chaque colonne a le sien (plan §9).
 *
 * L'en-tête a une hauteur FIXE (Supervision v2, A3) pour que les trois corps
 * s'alignent : le titre, l'unité, la phrase de lecture derrière un `fold-info`,
 * le chiffre de la colonne — ou, pendant une mise en avant, ce qu'elle y
 * trouve —, puis le sous-titre et les pastilles de blocage, cliquables. Au
 * téléphone, l'onglet nomme la colonne : il ne reste que le sous-titre court
 * et les pastilles.
 *
 * Sous l'en-tête, la **bande** (A4) : un emplacement projeté, `[columnBand]`,
 * que chaque colonne remplit de son repère et de son filtre. Ce cadre ne sait
 * rien de ce qu'il encadre ; seul le corps défile.
 */
@Component({
  selector: 'app-supervision-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInfoComponent,
    FoldLoadingStateComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    NgTemplateOutlet,
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

  /** Le chiffre de la colonne, `null` tant qu'elle n'a pas répondu. */
  readonly count = input<number | null>(null);
  /** « lignes ouvertes », « à coliser », « attendues ». */
  readonly countUnit = input('');
  readonly subtitle = input('');
  /** Ce que la mise en avant trouve ici ; `null` = rien n'est mis en avant. */
  readonly hits = input<number | null>(null);
  /** « 2 lignes » en Préparation, « 2 trouvées » ailleurs. */
  readonly hitWords = input<readonly [string, string]>(['trouvée', 'trouvées']);
  readonly blockers = input<readonly ColumnBlocker[]>([]);
  /** Plusieurs causes derrière une seule pastille « 3 blocages ▾ » (colonne 3, au bureau). */
  readonly groupBlockers = input(false);
  readonly focus = input<SupervisionFocus | null>(null);
  readonly narrow = input(false);

  readonly retry = output();
  readonly focusToggle = output<SupervisionFocus>();

  protected readonly menuOpen = signal(false);

  /** Une relecture a échoué : le contenu reste, et la colonne le dit. */
  protected readonly stale = computed(() => {
    const state = this.state();
    return state.status === 'ready' && state.stale;
  });

  protected readonly hitsLabel = computed(() => {
    const hits = this.hits() ?? 0;
    const [one, many] = this.hitWords();
    return hits === 0 ? 'rien ici' : countLabel(hits, one, many);
  });

  /** La pastille du menu : la cause choisie, sinon le total. */
  protected readonly menu = computed(() => {
    const blockers = this.blockers();
    const chosen = blockers.find((blocker) => blocker.key === this.focus());
    const total = blockers.reduce((sum, blocker) => sum + blocker.count, 0);
    return {
      label: chosen?.shortLabel ?? countLabel(total, 'blocage', 'blocages'),
      on: chosen !== undefined,
      tone: blockers.some((blocker) => blocker.tone === 'alert') ? 'alert' : 'warning',
    } as const;
  });

  protected pick(key: SupervisionFocus): void {
    this.menuOpen.set(false);
    this.focusToggle.emit(key);
  }
}
