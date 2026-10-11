import { Injectable, inject, signal } from '@angular/core';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { MediaSeriesApi } from '../data/media-series-api';

/**
 * **Les séries du fonds** — lues une fois, relues après chaque écriture.
 *
 * Une liste tenue par un store n'a pas d'état « chargement » : elle part vide
 * et se remplit. Son échec se retient, il ne se dit pas en bannière — un
 * choix de série vide ne doit pas faire croire que le fonds n'en a aucune.
 */
@Injectable()
export class MediaSeriesStore {
  private readonly api = inject(MediaSeriesApi);

  private readonly list = signal<readonly MediaSeriesView[]>([]);
  readonly all = this.list.asReadonly();
  /** Le refus du dernier chargement ; `null` quand la liste est juste. */
  readonly failure = signal<string | null>(null);

  async refresh(): Promise<void> {
    try {
      this.list.set(await this.api.series());
      this.failure.set(null);
    } catch (caught) {
      // Rien n'est appliqué : la liste garde ce qu'elle avait.
      this.failure.set(httpErrorMessage(caught, 'Les séries sont illisibles.'));
    }
  }

  find(id: string | null): MediaSeriesView | null {
    return id === null ? null : (this.list().find((series) => series.id === id) ?? null);
  }

  /** Ouvre une série, relit la liste, rend l'identifiant. Le refus est relancé. */
  async open(payload: MediaSeriesPayload): Promise<string> {
    const id = await this.api.openSeries(payload);
    await this.refresh();
    return id;
  }

  /** Corrige une série et relit la liste. Le refus est relancé. */
  async describe(id: string, payload: MediaSeriesPayload): Promise<void> {
    await this.api.describeSeries(id, payload);
    await this.refresh();
  }
}
