import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { GrowthStatsView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Lecture du **dashboard de croissance** — `GET /admin/growth/stats` (KPIs, courbe
 * d'acquisition, entonnoirs, cohortes), dérivé du journal côté backend. Même auth
 * staff que le reste de l'admin (bypass dev). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class GrowthService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async stats(): Promise<GrowthStatsView> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return firstValueFrom(
      this.http.get<GrowthStatsView>(`${B2B_API_BASE}/admin/growth/stats`, {
        headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      }),
    );
  }
}
