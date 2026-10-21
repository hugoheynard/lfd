import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  GeneralOrderCutoffResponse,
  OrderCutoffPayload,
  OrderCutoffView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **L'heure limite générale** — la seule depuis le 2026-10-21 (schéma des
 * réglages §4, point 4) : une ressource, `admin/order-cutoffs/general`, qu'on
 * lit et qu'on règle. Plus de liste, plus de suppression.
 */
@Injectable({ providedIn: 'root' })
export class OrderCutoffsService {
  private readonly http = inject(HttpClient);

  /** La règle générale, ou `null` tant qu'elle n'est pas posée. */
  async general(): Promise<OrderCutoffView | null> {
    const response = await firstValueFrom(
      this.http.get<GeneralOrderCutoffResponse>(`${B2B_API_BASE}/admin/order-cutoffs/general`),
    );
    return response.rule;
  }

  /** Pose ou règle la règle générale. */
  async define(payload: OrderCutoffPayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/order-cutoffs/general`, payload),
    );
  }
}
