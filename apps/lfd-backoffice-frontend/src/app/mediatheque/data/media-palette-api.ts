import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PALETTE_STRIP_LIMITS,
  type ImagePalette,
  type MediaPalettePayload,
  type MediaPaletteStripView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import type { MediaFeedCriteria } from '../rules/media-feed-url';
import { toPageRequest } from '../rules/feed-filters';
import { pageParams } from '../rules/media-page-request';

/** **Les couleurs du fonds** — la palette d'une image et la frise d'un filtre. */
@Injectable({ providedIn: 'root' })
export class MediaPaletteApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/media`;

  /**
   * **Le rattrapage d'une palette** (`mediatheque.md` §9 bis) — 204 qu'elle soit posée ou déjà
   * présente : le serveur n'écrase jamais une palette existante.
   */
  async paint(url: string, palette: ImagePalette): Promise<void> {
    const body: MediaPalettePayload = { url, palette: [...palette] };
    await firstValueFrom(this.http.put<void>(`${this.base}/palette`, body));
  }

  /**
   * **La frise des couleurs, lue au serveur** — `GET /media/palette-strip`.
   *
   * 🔴 Le serveur agrège : la frise ne dépend pas du nombre de photos chargées
   * par le feed, et couvre TOUT le filtre. Les filtres sont ceux du feed, à la
   * lettre (`pageParams`) — sans pagination ni tri, qui n'ont pas de sens ici.
   */
  async strip(criteria: MediaFeedCriteria, columns: number): Promise<MediaPaletteStripView> {
    const { limit: _limit, sort: _sort, ...filters } = pageParams(toPageRequest(criteria, 1, null));
    return firstValueFrom(
      this.http.get<MediaPaletteStripView>(`${this.base}/palette-strip`, {
        // Borné ici : le serveur refuserait au-delà de `maxColumns`.
        params: { ...filters, columns: String(bounded(columns)) },
      }),
    );
  }
}

function bounded(columns: number): number {
  return Math.min(PALETTE_STRIP_LIMITS.maxColumns, Math.max(1, Math.floor(columns)));
}
