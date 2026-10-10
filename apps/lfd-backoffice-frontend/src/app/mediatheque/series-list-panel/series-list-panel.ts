import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MediaSeriesView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { seriesDay } from '../media-series';

/** Ce que la liste lit — des signaux, pour se recomposer après une correction. */
export interface SeriesListPanelData {
  readonly series: () => readonly MediaSeriesView[];
  readonly failure: () => string | null;
  /** Ouvre le panneau de série par-dessus ; `null` = une nouvelle. */
  readonly edit: (series: MediaSeriesView | null) => void;
}

/** Une ligne, mise en forme une fois. */
interface SeriesLine {
  readonly series: MediaSeriesView;
  readonly day: string;
  readonly images: string;
}

/**
 * **Les séries du fonds** — les lire, les corriger, en ouvrir une.
 *
 * Pas de suppression : le serveur n'en a pas (plan L3). Une série vide reste
 * listée, avec son compte à zéro.
 */
@Component({
  selector: 'app-series-list-panel',
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './series-list-panel.html',
  styleUrl: './series-list-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesListPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject(FoldPanelRef);

  readonly data = input.required<SeriesListPanelData>();

  protected readonly lines = computed(() =>
    this.data()
      .series()
      .map((series): SeriesLine => ({
        series,
        day: seriesDay(series.shotOn) ?? 'Date de prise de vue inconnue',
        images: imagesWording(series.images),
      })),
  );

  protected close(): void {
    this.ref.close();
  }
}

/** « Aucune image », « 1 image », « 12 images ». */
export function imagesWording(count: number): string {
  if (count === 0) {
    return 'Aucune image';
  }
  return count === 1 ? '1 image' : `${String(count)} images`;
}
