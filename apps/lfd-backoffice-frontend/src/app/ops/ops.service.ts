import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DeadLettersView } from '@lfd/contracts';
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

  /** Ce que la gateway a vu passer sur la fenêtre demandée. */
  traffic(minutes: number): Promise<TrafficReport> {
    return firstValueFrom(
      this.http.get<TrafficReport>(`${B2B_API_BASE}/admin/ops/traffic?minutes=${minutes}`),
    );
  }

  /** Les messages morts de la boîte d'envoi, les plus récents d'abord, bornés. */
  deadLetters(): Promise<DeadLettersView> {
    return firstValueFrom(
      this.http.get<DeadLettersView>(`${B2B_API_BASE}/admin/outbox/dead-letters`),
    );
  }

  /** Rejoue UN couple message × abonné. 404 : couple inconnu ; 409 : déjà livré. */
  replay(eventId: string, subscriber: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/outbox/replay`, { eventId, subscriber }),
    );
  }
}
