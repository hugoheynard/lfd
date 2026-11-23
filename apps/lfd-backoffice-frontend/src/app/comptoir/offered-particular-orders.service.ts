import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import type {
  AdminOrderEstimateView,
  OfferedParticularOrderEstimatePayload,
  OfferedParticularOrderPayload,
  OfferedParticularPlacedOrderResponse,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const OFFERED_PARTICULAR = `${B2B_API_BASE}/admin/offered-orders/particular`;

/**
 * **La commande offerte à un particulier** (`plan-commande-offerte.md`,
 * § 2.4) — transport pur. Sa route à elle, distincte de la commande notée au
 * comptoir : le devis, puis la passation sous la clé d'intention de l'écran.
 */
@Injectable({ providedIn: 'root' })
export class OfferedParticularOrdersService {
  private readonly http = inject(HttpClient);

  /** Zéro et la valeur offerte avec le motif, la valeur pleine sans. Un flux, pour l'annuler en vol. */
  estimate(payload: OfferedParticularOrderEstimatePayload): Observable<AdminOrderEstimateView> {
    return this.http.post<AdminOrderEstimateView>(`${OFFERED_PARTICULAR}/estimate`, payload);
  }

  place(
    payload: OfferedParticularOrderPayload,
    intentKey: string,
  ): Promise<OfferedParticularPlacedOrderResponse> {
    return firstValueFrom(
      this.http.post<OfferedParticularPlacedOrderResponse>(
        OFFERED_PARTICULAR,
        payload,
        intentOptions(intentKey),
      ),
    );
  }
}
