import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { PALETTE_STRIP_LIMITS, type MediaPaletteStripView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { pageParams } from './media-library-http-api';
import { toPageRequest, type MediaFeedCriteria } from './media-feed-url';

/**
 * **La frise des couleurs, lue au serveur** — `GET /media/palette-strip`.
 *
 * 🔴 Le serveur agrège : la frise ne dépend pas du nombre de photos chargées
 * par le feed, et couvre TOUT le filtre. Les filtres sont ceux du feed, à la
 * lettre (`pageParams`) — sans pagination ni tri, qui n'ont pas de sens ici.
 */
@Injectable({ providedIn: 'root' })
export class PaletteStripApi {
  private readonly http = inject(HttpClient);

  async strip(criteria: MediaFeedCriteria, columns: number): Promise<MediaPaletteStripView> {
    const { limit: _limit, sort: _sort, ...filters } = pageParams(toPageRequest(criteria, 1, null));
    return firstValueFrom(
      this.http.get<MediaPaletteStripView>(`${B2B_API_BASE}/media/palette-strip`, {
        // Borné ici : le serveur refuserait au-delà de `maxColumns`.
        params: { ...filters, columns: String(bounded(columns)) },
      }),
    );
  }
}

function bounded(columns: number): number {
  return Math.min(PALETTE_STRIP_LIMITS.maxColumns, Math.max(1, Math.floor(columns)));
}
