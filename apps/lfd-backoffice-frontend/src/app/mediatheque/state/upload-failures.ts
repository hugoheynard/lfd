import { Injectable, inject, signal } from '@angular/core';
import type { MediaUploadFailureView } from '@lfd/pim-contracts';

import { MediaImagesApi } from '../data/media-images-api';

/**
 * **Les refus des jours passés** — ce qui n'est pas entré au fonds, relu au
 * serveur quand on ouvre l'historique : personne ne le consulte à chaque
 * visite.
 *
 * Fourni par le dépôt, qui le montre.
 */
@Injectable()
export class UploadFailuresStore {
  private readonly api = inject(MediaImagesApi);

  readonly failures = signal<readonly MediaUploadFailureView[]>([]);
  readonly open = signal(false);

  /** Ouvre — ou referme — l'historique ; seule l'ouverture relit. */
  async toggle(): Promise<void> {
    const opening = !this.open();
    this.open.set(opening);
    if (!opening) {
      return;
    }
    try {
      this.failures.set(await this.api.failures());
    } catch {
      // Muet et vide : un historique illisible n'est pas une panne du fonds.
      this.failures.set([]);
    }
  }
}
