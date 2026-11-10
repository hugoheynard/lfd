import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CounterIncompleteHandoverPayload,
  CounterIncompleteHandoverView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le départ incomplet, au comptoir** (plan
 * `documentation/commandes/reliquat/reliquat.md`, lot C2) —
 * sous `handover_counter`.
 *
 * L'aperçu ne promet rien : le geste rejuge tout sous verrou, et son refus se
 * lit dans le dialogue.
 */
@Injectable({ providedIn: 'root' })
export class CounterIncompleteHandoverService {
  private readonly http = inject(HttpClient);

  /** Ce qui partirait, ce qui ne partirait pas, et le premier refus du geste. */
  preview(orderId: string): Promise<CounterIncompleteHandoverView> {
    return firstValueFrom(this.http.get<CounterIncompleteHandoverView>(this.url(orderId)));
  }

  /**
   * Remet ce qui est au bac ; le reste est abandonné. 204. `token` : le jeton
   * du QR quand un scan a ouvert la fiche — le serveur grave alors `scan`.
   */
  handOver(orderId: string, token: string | null = null): Promise<void> {
    const body: CounterIncompleteHandoverPayload =
      token === null ? { remainder: 'abandoned' } : { remainder: 'abandoned', token };
    return firstValueFrom(this.http.post<void>(this.url(orderId), body));
  }

  private url(orderId: string): string {
    return `${B2B_API_BASE}/admin/counter/orders/${encodeURIComponent(orderId)}/incomplete-handover`;
  }
}
