import { Injectable, inject } from '@angular/core';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldPanelHostService } from 'fold-ng';

import { MediaSeriesStore, parisToday } from './media-series';
import {
  SeriesPanel,
  type SeriesPanelData,
  type SeriesPanelResult,
  type SeriesSaveOutcome,
} from './series-panel/series-panel';

/**
 * **Ouvrir ou corriger une série**, d'où qu'on le demande — le dépôt, la
 * liste des séries. Un seul chemin, pour qu'un refus se dise partout pareil.
 *
 * Fourni par la page, comme le magasin des séries qu'il écrit.
 */
@Injectable()
export class SeriesEditor {
  private readonly panels = inject(FoldPanelHostService);
  private readonly store = inject(MediaSeriesStore);

  /**
   * Ouvre le panneau ; rend l'identifiant de la série écrite, `undefined` si
   * l'on a annulé. `stack` : la liste des séries reste derrière.
   */
  async edit(series: MediaSeriesView | null, stack = false): Promise<string | undefined> {
    const result = await this.panels.open<SeriesPanelData, SeriesPanelResult>(SeriesPanel, {
      stack,
      data: {
        series,
        today: parisToday(),
        save: (payload) => this.write(series, payload),
      },
    }).closed;
    return result?.id;
  }

  private async write(
    series: MediaSeriesView | null,
    payload: MediaSeriesPayload,
  ): Promise<SeriesSaveOutcome> {
    try {
      if (series === null) {
        return { id: await this.store.open(payload) };
      }
      await this.store.describe(series.id, payload);
      return { id: series.id };
    } catch (caught) {
      // La phrase du serveur — elle nomme la règle (titre vide, jour à venir).
      return { refusal: httpErrorMessage(caught, "La série n'a pas pu être enregistrée.") };
    }
  }
}
