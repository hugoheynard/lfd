import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le bon de commande, au comptoir** — `GET /admin/counter/orders/:orderId/bon.pdf`,
 * sous `handover_counter:read` (Hugo, 2026-11-03, option A). Le même document
 * chiffré que celui du client : il n'y a qu'un bon de commande.
 */
@Injectable({ providedIn: 'root' })
export class CounterOrderSheetService {
  private readonly http = inject(HttpClient);

  pdf(orderId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/counter/orders/${encodeURIComponent(orderId)}/bon.pdf`, {
        responseType: 'blob',
      }),
    );
  }
}
