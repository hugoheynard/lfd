import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  OrderOpeningExemptionPayload,
  OrderOpeningExemptionView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les exemptions à la fermeture de la boutique** (décision de Hugo du
 * 2026-10-26) : les sociétés et les adresses qui commandent malgré la
 * fermeture de leur clientèle. Sous le droit du réglage, `lfc_order_opening`.
 */
@Injectable({ providedIn: 'root' })
export class OrderOpeningExemptionsService {
  private readonly http = inject(HttpClient);

  /** Les actives, les plus récentes d'abord. */
  list(): Promise<readonly OrderOpeningExemptionView[]> {
    return firstValueFrom(this.http.get<readonly OrderOpeningExemptionView[]>(this.url()));
  }

  grant(payload: OrderOpeningExemptionPayload): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.url(), payload));
  }

  /** Retire de la liste : le serveur archive, il n'efface pas. `204` sans corps. */
  withdraw(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url()}/${encodeURIComponent(id)}`));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/order-opening/exemptions`;
  }
}
