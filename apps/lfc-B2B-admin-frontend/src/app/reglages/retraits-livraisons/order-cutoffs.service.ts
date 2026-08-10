import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedOrderCutoffResponse,
  OrderCutoffPayload,
  OrderCutoffView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Heures limites de commande** — une règle par ligne (point de retrait × jour).
 * Lecture **et** écriture staff : contrairement aux zones, le client n'en a pas
 * besoin pour l'instant (le checkout ne les applique pas encore).
 */
@Injectable({ providedIn: 'root' })
export class OrderCutoffsService {
  private readonly http = inject(HttpClient);

  /** Les règles, de la plus spécifique à la plus générale. */
  async list(): Promise<readonly OrderCutoffView[]> {
    return firstValueFrom(
      this.http.get<readonly OrderCutoffView[]>(`${B2B_API_BASE}/admin/order-cutoffs`),
    );
  }

  async create(payload: OrderCutoffPayload): Promise<CreatedOrderCutoffResponse> {
    return firstValueFrom(
      this.http.post<CreatedOrderCutoffResponse>(`${B2B_API_BASE}/admin/order-cutoffs`, payload),
    );
  }

  async update(id: string, payload: OrderCutoffPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/order-cutoffs/${id}`, payload),
    );
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/order-cutoffs/${id}`));
  }
}
