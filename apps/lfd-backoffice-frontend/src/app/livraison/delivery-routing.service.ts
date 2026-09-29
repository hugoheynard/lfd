import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ApplyDeliveryProposalPayload,
  DeliveryProposalMode,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsPayload,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const ROUNDS = `${B2B_API_BASE}/admin/livraison/tournees`;
const SETTINGS = `${B2B_API_BASE}/admin/livraison/calcul`;

/** Ce qu'on demande au calculateur. `vehicleIds: null` : ceux qui roulent ce jour-là. */
export interface ProposalRequest {
  readonly day: string;
  readonly vehicleIds: readonly string[] | null;
  readonly recomposeAll: boolean;
  /** `null` : le mode par défaut des réglages. */
  readonly mode: DeliveryProposalMode | null;
}

/**
 * **Le calculateur de tournée** (`plan-preparation-de-tournee.md`, lot 7) :
 * situer et appliquer sous `delivery_rounds:write`, proposer sous
 * `delivery_rounds:read`, ses réglages sous `delivery_settings`.
 *
 * Aucun état, aucun nouvel essai : « reproposez » remonte tel quel.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryRoutingService {
  private readonly http = inject(HttpClient);

  async locate(day: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${ROUNDS}/situer`, null, { params: new HttpParams().set('jour', day) }),
    );
  }

  propose(request: ProposalRequest): Promise<DeliveryRoundProposalView> {
    let params = new HttpParams()
      .set('jour', request.day)
      .set('toutRecomposer', String(request.recomposeAll));
    if (request.mode !== null) {
      params = params.set('mode', request.mode);
    }
    if (request.vehicleIds !== null) {
      params = params.set('vehicules', request.vehicleIds.join(','));
    }
    return firstValueFrom(
      this.http.get<DeliveryRoundProposalView>(`${ROUNDS}/proposition`, { params }),
    );
  }

  async apply(payload: ApplyDeliveryProposalPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${ROUNDS}/proposition`, payload));
  }

  settings(): Promise<DeliveryRoutingSettingsView> {
    return firstValueFrom(this.http.get<DeliveryRoutingSettingsView>(SETTINGS));
  }

  async saveSettings(payload: DeliveryRoutingSettingsPayload): Promise<void> {
    await firstValueFrom(this.http.put(SETTINGS, payload));
  }
}
