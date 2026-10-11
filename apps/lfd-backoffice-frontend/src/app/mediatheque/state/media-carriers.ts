import { Injectable, inject, signal } from '@angular/core';
import type { MediaCarrierView } from '@lfd/pim-contracts';

import { MediaCarriersApi } from '../data/media-carriers-api';

/**
 * **Les porteurs d'UNE image**, lus pour un panneau qui en dépend.
 *
 * 🔴 Un échec de LECTURE n'est pas une absence de porteurs. Les confondre
 * ferait croire l'image libre au premier réseau qui tousse ; `failure` le
 * retient, et l'écran ferme le geste qui en dépend.
 */
@Injectable()
export class MediaCarriersStore {
  private readonly api = inject(MediaCarriersApi);

  readonly carriers = signal<readonly MediaCarrierView[]>([]);
  readonly loading = signal(true);
  readonly failure = signal<string | null>(null);

  async load(url: string): Promise<void> {
    this.loading.set(true);
    this.failure.set(null);
    try {
      this.carriers.set(await this.api.carriersOf(url));
    } catch {
      this.failure.set("La liste des porteurs n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
  }
}
