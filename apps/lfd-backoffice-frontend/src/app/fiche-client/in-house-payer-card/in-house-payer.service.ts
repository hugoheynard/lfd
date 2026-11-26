import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { InHousePayerPayload, InHousePayerView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

/**
 * **La nature « maison » d'un client** (`/admin/companies/:id/in-house`) :
 * lue sous `b2b_companies:read`, posée sous `b2b_in_house_payers:write` avec
 * la clé d'intention de l'écran (`Idempotency-Key`, obligatoire).
 */
@Injectable({ providedIn: 'root' })
export class InHousePayerService {
  private readonly http = inject(HttpClient);

  read(companyId: string): Promise<InHousePayerView> {
    return firstValueFrom(this.http.get<InHousePayerView>(this.url(companyId)));
  }

  /** `204` ; `409` pour un organisme public ou un suivi de facturation entre deux natures. */
  async set(companyId: string, inHouse: boolean, intentKey: string): Promise<void> {
    const payload: InHousePayerPayload = { inHouse };
    await firstValueFrom(this.http.put(this.url(companyId), payload, intentOptions(intentKey)));
  }

  private url(companyId: string): string {
    return `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/in-house`;
  }
}
