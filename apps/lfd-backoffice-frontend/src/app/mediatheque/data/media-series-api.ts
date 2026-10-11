import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreatedIdResponse, MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/** **Les séries de prise de vue** — `/media/series`. */
@Injectable({ providedIn: 'root' })
export class MediaSeriesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/media/series`;

  /** Les séries, la plus récente prise de vue en tête — l'ordre du serveur. */
  async series(): Promise<readonly MediaSeriesView[]> {
    return firstValueFrom(this.http.get<readonly MediaSeriesView[]>(this.base));
  }

  /** Ouvre une série ; rend son identifiant. Les refus (400) nomment la règle. */
  async openSeries(payload: MediaSeriesPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(this.base, payload));
    return created.id;
  }

  /** Corrige le titre, la date ou la note d'une série. Pas de suppression : le serveur n'en a pas. */
  async describeSeries(id: string, payload: MediaSeriesPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${encodeURIComponent(id)}`, payload));
  }
}
