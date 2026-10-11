import { Injectable, inject, signal } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';

import { MediaFeedStore } from './media-feed';
import { MediaLibraryHttpApi } from './media-library-http-api';
import { PALETTE_READER } from './palette-extract';

/**
 * **Le rattrapage des palettes** (plan L9) — les images déposées avant la
 * frise, ou dont le navigateur n'a pas su lire les couleurs au dépôt.
 *
 * L'écran calcule, le serveur range (`PUT /media/palette`, sans écrasement).
 *
 * 🔴 Par LOTS de {@link BACKFILL_BATCH}, une image à la fois, en tâche de
 * fond : le décodage occupe le fil principal. Chaque lot fini le dit
 * ({@link batches}), et la frise se relit.
 * 🔴 UNE tentative par adresse et par écran : une image servie sans CORS
 * échouerait à chaque passage, et la retenter en boucle ne la rendrait pas
 * lisible. L'échec est silencieux — la colonne reste hachurée.
 */
/** La taille d'un lot de rattrapage. */
export const BACKFILL_BATCH = 20;

@Injectable()
export class PaletteBackfill {
  /** Le nombre de lots finis qui ont posé au moins une palette. */
  readonly batches = signal(0);
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly feed = inject(MediaFeedStore);
  private readonly read = inject(PALETTE_READER);

  private readonly tried = new Set<string>();
  private readonly waiting: string[] = [];
  private running = false;

  /** Met en file les images sans palette pas encore tentées. */
  offer(items: readonly LibraryMediaView[]): void {
    for (const item of items) {
      if (item.palette === null && !this.tried.has(item.url)) {
        this.tried.add(item.url);
        this.waiting.push(item.url);
      }
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (this.waiting.length > 0) {
        let painted = 0;
        for (const url of this.waiting.splice(0, BACKFILL_BATCH)) {
          painted += (await this.paintOne(url)) ? 1 : 0;
        }
        if (painted > 0) {
          this.batches.update((count) => count + 1);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async paintOne(url: string): Promise<boolean> {
    const palette = await this.read(url).catch(() => null);
    if (palette === null) {
      return false;
    }
    try {
      await this.api.paint(url, palette);
      this.feed.paint(url, palette);
      return true;
    } catch {
      // Refus ou réseau : la colonne reste neutre, et on ne retente pas.
      return false;
    }
  }
}
