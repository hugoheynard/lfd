import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ExportReaderKeyView,
  IssuedExportReaderKeyResponse,
  IssueExportReaderKeyPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { GestureIntents, intentOptions, sentOnce, shownOnce } from '../shared/gesture-intents';

/**
 * **Les clés de lecture de l'export des ventes** (`/admin/export-keys`, sous
 * `exports` ; plan `documentation/commandes/export/plan-export-des-ventes.md`,
 * § 6.1). Le secret ne revient qu'à la création : aucune lecture ne le rend, et
 * un rejeu de la même intention est refusé en 409 — d'où `shownOnce`, qui
 * oublie la clé d'intention sur ce refus pour que le clic suivant soit neuf.
 */
@Injectable({ providedIn: 'root' })
export class ExportKeysService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/export-keys`;
  private readonly intents = new GestureIntents();

  list(): Promise<readonly ExportReaderKeyView[]> {
    return firstValueFrom(this.http.get<readonly ExportReaderKeyView[]>(this.base));
  }

  issue(payload: IssueExportReaderKeyPayload): Promise<IssuedExportReaderKeyResponse> {
    return shownOnce(this.intents, `issue:${JSON.stringify(payload)}`, (key) =>
      firstValueFrom(
        this.http.post<IssuedExportReaderKeyResponse>(this.base, payload, intentOptions(key)),
      ),
    );
  }

  /** Effet immédiat : la garde de l'export relit la base à chaque appel. */
  revoke(id: string): Promise<void> {
    return sentOnce(this.intents, `revoke:${id}`, async (key) => {
      await firstValueFrom(
        this.http.post<void>(`${this.base}/${id}/revoke`, null, intentOptions(key)),
      );
    });
  }
}
