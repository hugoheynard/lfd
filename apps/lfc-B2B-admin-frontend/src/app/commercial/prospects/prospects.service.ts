import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProspectView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Lecture des **prospects** (hot/mid) dérivés du journal — `GET /admin/prospects`.
 * Même auth staff que le reste de l'admin (token relayé par le shell ; `null` en
 * dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class ProspectsService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly ProspectView[]> {
    return firstValueFrom(
      this.http.get<readonly ProspectView[]>(`${B2B_API_BASE}/admin/prospects`, {
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
