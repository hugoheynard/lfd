import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { LeadScoreView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Lecture de la queue **« 5 meilleurs coups du jour »** — `GET /admin/cockpit`,
 * servie du read-model matérialisé `lead_score` (recalculé par cron, pas temps
 * réel). Même auth staff que le reste de l'admin (token relayé par le shell ;
 * `null` en dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class CockpitService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly LeadScoreView[]> {
    return firstValueFrom(
      this.http.get<readonly LeadScoreView[]>(`${B2B_API_BASE}/admin/cockpit`, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** En-tête `Authorization` staff, ou vide en dev/standalone (bypass backend). */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  }
}
