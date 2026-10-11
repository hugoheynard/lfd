import { computed, signal } from '@angular/core';
import type { MediaSeriesRefView, MediaSeriesView } from '@lfd/pim-contracts';
import type { FoldSelectOption } from 'fold-ng';

import { seriesOptions, seriesRefOf } from '../rules/series';

/**
 * **La série d'UNE image, en cours de choix** — celle qui partira, et la liste
 * qui s'ouvre sur « Changer ».
 *
 * `choices` absent : la série se lit, elle ne se change pas. Relu à chaque
 * ouverture de la liste — une série ouverte entre-temps y paraît.
 */
export class SeriesChoice {
  /** La série, telle qu'elle partira ; `null` = aucune. */
  readonly current = signal<MediaSeriesRefView | null>(null);
  /** « Changer » a été demandé : la liste des séries s'ouvre. */
  readonly changing = signal(false);
  readonly canChange = computed(() => this.choices() !== undefined);
  readonly options = computed((): readonly FoldSelectOption<string>[] =>
    seriesOptions(this.choices()?.() ?? []),
  );

  constructor(private readonly choices: () => (() => readonly MediaSeriesView[]) | undefined) {}

  /** Rattache à une série de la liste, ou détache (« Aucune série »). */
  choose(id: string): void {
    this.current.set(seriesRefOf(this.choices()?.().find((entry) => entry.id === id)));
    this.changing.set(false);
  }

  /** Repart de la série d'une image, liste refermée. */
  reset(series: MediaSeriesRefView | null): void {
    this.current.set(series);
    this.changing.set(false);
  }
}
