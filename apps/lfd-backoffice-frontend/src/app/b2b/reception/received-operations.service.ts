import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ReceivedOperationView, SetOperationOverridePayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les opérations reçues du référentiel**, et leur surcharge à la réception
 * (D9 de `documentation/order/architecture-operations-datees.md`).
 *
 * Lire relève de `b2b_catalog:read`, écrire de `b2b_catalog:write` — le même
 * droit que la validation des arrivées.
 */
@Injectable({ providedIn: 'root' })
export class ReceivedOperationsService {
  private readonly http = inject(HttpClient);

  /** Le miroir entier, opérations retirées comprises : leur surcharge se garde. */
  list(): Promise<readonly ReceivedOperationView[]> {
    return firstValueFrom(
      this.http.get<readonly ReceivedOperationView[]>(`${B2B_API_BASE}/admin/catalog/operations`),
    );
  }

  /**
   * Pose la surcharge ENTIÈRE, comme le panneau l'affiche. `404` si l'opération
   * n'a jamais été reçue.
   */
  async setOverride(key: string, payload: SetOperationOverridePayload): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/catalog/operations/${encodeURIComponent(key)}/override`,
        payload,
      ),
    );
  }
}
