import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PendingStopDecisionsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const DECIDE = `${B2B_API_BASE}/admin/livraison/a-decider`;

/**
 * **« À décider »** (`documentation/livraisons/plan-a-la-porte.md`, B3) —
 * transport pur, sous `b2b_companies:write` (le droit des commerciaux).
 */
@Injectable({ providedIn: 'root' })
export class StopDecisionsService {
  private readonly http = inject(HttpClient);

  pending(): Promise<PendingStopDecisionsView> {
    return firstValueFrom(this.http.get<PendingStopDecisionsView>(DECIDE));
  }

  async authorizeDeposit(stopId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${DECIDE}/${encodeURIComponent(stopId)}/autoriser-depot`, null),
    );
  }

  async bringBack(stopId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${DECIDE}/${encodeURIComponent(stopId)}/rapporter`, null),
    );
  }

  /** La photo d'un signalement à décider, en blob : un `<img src>` nu n'enverrait pas le jeton. */
  photo(stopId: string, incidentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(
        `${DECIDE}/${encodeURIComponent(stopId)}/incidents/${encodeURIComponent(incidentId)}/photo`,
        { responseType: 'blob' },
      ),
    );
  }
}
