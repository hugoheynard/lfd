import { Injectable, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type { MediaPaletteStripView } from '@lfd/pim-contracts';

import type { MediaFeedCriteria } from './media-feed-url';
import { PaletteStripApi } from './palette-strip-api';

/**
 * L'état de la frise : la dernière vue lue, ou le refus. Une réponse arrivée
 * après une demande plus récente est jetée — un redimensionnement en rafale
 * ne doit pas peindre une largeur périmée.
 */
@Injectable()
export class PaletteStripStore {
  private readonly api = inject(PaletteStripApi);
  private generation = 0;

  readonly view = signal<MediaPaletteStripView | null>(null);
  readonly failure = signal<string | null>(null);

  async load(criteria: MediaFeedCriteria, columns: number): Promise<void> {
    const generation = ++this.generation;
    try {
      const view = await this.api.strip(criteria, columns);
      if (generation === this.generation) {
        this.view.set(view);
        this.failure.set(null);
      }
    } catch (caught) {
      if (generation === this.generation) {
        this.failure.set(httpErrorMessage(caught, "La frise des couleurs n'a pas pu être lue."));
      }
    }
  }
}
