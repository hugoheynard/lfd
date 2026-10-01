import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import type { LoadingGateway } from './loading-gateway';

const MY_ROUND = `${B2B_API_BASE}/admin/livraison/ma-tournee`;

function loadingUrl(roundId: string): string {
  return `${MY_ROUND}/${encodeURIComponent(roundId)}/chargement`;
}

/**
 * **Charger MA tournée** (`parcours-du-livreur.md`, PL1), sous
 * `delivery_driving` — lire pour voir, écrire pour scanner.
 *
 * La porte du livreur vers le chargement : mêmes vues et mêmes corps que celle
 * du dépôt, mais le serveur pose le mur `driver_staff_id` — une tournée d'un
 * autre rend 404. Partir n'est pas ici : c'est « Commencer ma tournée ».
 */
@Injectable({ providedIn: 'root' })
export class MyDeliveryLoadingService implements LoadingGateway {
  private readonly http = inject(HttpClient);

  round(roundId: string): Promise<DeliveryLoadingRoundView> {
    return firstValueFrom(this.http.get<DeliveryLoadingRoundView>(loadingUrl(roundId)));
  }

  plan(roundId: string): Promise<DeliveryLoadingPlanView> {
    return firstValueFrom(this.http.get<DeliveryLoadingPlanView>(`${loadingUrl(roundId)}/plan`));
  }

  async load(roundId: string, payload: LoadDeliveryBinPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${loadingUrl(roundId)}/bacs`, payload));
  }

  async unload(roundId: string, binId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${loadingUrl(roundId)}/bacs/${encodeURIComponent(binId)}/dechargement`, {}),
    );
  }
}
