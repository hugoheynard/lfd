import { Injectable, inject } from '@angular/core';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldPanelHostService } from 'fold-ng';

import { MediaSeriesStore } from '../state/media-series';
import { parisDay } from '../rules/paris-calendar';
import {
  SeriesPanel,
  type SeriesPanelData,
  type SeriesPanelResult,
  type SeriesSaveOutcome,
} from '../ui/series-panel/series-panel';
import {
  SeriesListPanel,
  type SeriesListPanelData,
} from '../ui/series-list-panel/series-list-panel';

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
        // La borne haute d'une prise de vue, lue à l'ouverture du panneau. Le
        // serveur reste l'autorité (il refuse un jour à venir) ; l'écran ne
        // fait que griser ce qu'il refuserait.
        today: parisDay(new Date()),
        save: (payload) => this.write(series, payload),
      },
    }).closed;
    return result?.id;
  }

  /**
   * Ouvre la liste des séries. « Modifier » et « Nouvelle série » ouvrent le
   * panneau de série PAR-DESSUS : la liste reste derrière, et se relit.
   *
   * @returns `true` si une série a été écrite — ce que les tuiles montrent
   *   (titre, date) a changé, et la grille est à relire, une fois.
   */
  async manage(): Promise<boolean> {
    let touched = false;
    await this.panels.open<SeriesListPanelData, void>(SeriesListPanel, {
      data: {
        series: () => this.store.all(),
        failure: () => this.store.failure(),
        edit: (series) => {
          // `edit` rend le refus dans son panneau ; il ne rejette pas.
          void this.edit(series, true).then((id) => {
            touched ||= id !== undefined;
          });
        },
      },
    }).closed;
    return touched;
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
