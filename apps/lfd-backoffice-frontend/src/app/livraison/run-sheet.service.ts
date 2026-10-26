import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DeliveryRunSheetView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La feuille de route du jour**, en lecture seule (`delivery_run_sheet:read`
 * côté API). Son seul lecteur est Tour manager (`rounds-day.ts`), qui la joint
 * à la composition : l'écran « Feuille de route » a été retiré le 2026-10-26
 * (décision de Hugo). Aucun état : l'appelant relit quand on change de jour.
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
        : `&orders=${alsoOrderIds.map((id) => encodeURIComponent(id)).join(',')}`;
    return firstValueFrom(
      this.http.get<DeliveryRunSheetView>(
        `${B2B_API_BASE}/admin/delivery/run-sheet?day=${encodeURIComponent(day)}${also}`,
      ),
    );
  }
}
