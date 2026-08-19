import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { EcosystemHealth, TrafficReport } from '@lfd/ops-contract';

import { B2B_API_BASE } from '../api/api-config';

/**
 * La carte de santé, telle que l'API la rend. **Aucun état, aucun jugement** :
 * la dérivation vit côté serveur, pure et testée, et la dupliquer ici créerait
 * deux vérités sur ce que « ça va » veut dire.
 */
@Injectable({ providedIn: 'root' })
export class OpsService {
  private readonly http = inject(HttpClient);

  /** L'état de tous les nœuds déclarés, à l'instant. */
  health(): Promise<EcosystemHealth> {
    return firstValueFrom(this.http.get<EcosystemHealth>(`${B2B_API_BASE}/admin/ops/health`));
  }

  /** Ce que la passerelle a vu passer sur la fenêtre demandée. */
  traffic(minutes: number): Promise<TrafficReport> {
    return firstValueFrom(
      this.http.get<TrafficReport>(`${B2B_API_BASE}/admin/ops/traffic?minutes=${minutes}`),
    );
  }
}
