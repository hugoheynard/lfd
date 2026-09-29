import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DeliveryRunSheetView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La feuille de route du jour**, en lecture seule — sous la même porte que la
 * route `livraison/feuille-de-route` (`delivery_run_sheet:read`, depuis le
 * 2026-09-29 ; `b2b_orders:read` avant). Aucun état : la page relit quand on
 * change de jour.
 */
@Injectable({ providedIn: 'root' })
export class RunSheetService {
  private readonly http = inject(HttpClient);

  async day(day: string): Promise<DeliveryRunSheetView> {
    return firstValueFrom(
      this.http.get<DeliveryRunSheetView>(
        `${B2B_API_BASE}/admin/livraison/feuille-de-route?jour=${encodeURIComponent(day)}`,
      ),
    );
  }
}
