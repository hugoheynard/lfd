import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { LeadScoreView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Lecture de la queue **« 5 meilleurs coups du jour »** — `GET /admin/cockpit`,
 * servie du read-model matérialisé `lead_score` (recalculé par cron, pas temps
 * réel). Même auth staff que le reste de l'admin (token relayé par le shell ;
 * `null` en dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class CockpitService {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly LeadScoreView[]> {
    return firstValueFrom(this.http.get<readonly LeadScoreView[]>(`${B2B_API_BASE}/admin/cockpit`));
  }
}
