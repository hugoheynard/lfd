import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DeliveryDepositPayload } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **« Dépôt autorisé » réglé par le staff** (`documentation/livraisons/plan-a-la-porte.md`,
 * AP-D5) — une route à part, sous `delivery_procedures:write` : la route
 * d'édition de l'adresse (sous `b2b_companies`) ne le touche pas.
 */
@Injectable({ providedIn: 'root' })
export class AdminDeliveryDepositService {
  private readonly http = inject(HttpClient);

  async set(companyId: string, addressId: string, depositAllowed: boolean): Promise<void> {
    const payload: DeliveryDepositPayload = { depositAllowed };
    await firstValueFrom(
      this.http.put(
        `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/delivery-addresses/${encodeURIComponent(addressId)}/deposit`,
        payload,
      ),
    );
  }
}
