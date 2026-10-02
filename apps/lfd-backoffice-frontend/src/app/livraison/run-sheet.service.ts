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

  /**
   * `alsoOrderIds` : des livraisons d'un autre jour demandé que la composition
   * a placées ce jour-là (commandes rapportées, `decisions-par-defaut-2026-10-02.md`,
   * § 4) — le jour seul ne les retrouverait pas.
   */
  async day(day: string, alsoOrderIds: readonly string[] = []): Promise<DeliveryRunSheetView> {
    const also =
      alsoOrderIds.length === 0
        ? ''
        : `&commandes=${alsoOrderIds.map((id) => encodeURIComponent(id)).join(',')}`;
    return firstValueFrom(
      this.http.get<DeliveryRunSheetView>(
        `${B2B_API_BASE}/admin/livraison/feuille-de-route?jour=${encodeURIComponent(day)}${also}`,
      ),
    );
  }
}
