import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ActivationView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../../api/api-config';
import { SuiteEmbed } from '../../../suite-embed/suite-embed';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Lecture du **tunnel d'activation** (complétion / frictions / adoption+) dérivé
 * du journal — `GET /admin/activations`. Même auth staff que le reste de l'admin.
 */
@Injectable({ providedIn: 'root' })
export class ActivationsService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly ActivationView[]> {
    return firstValueFrom(
      this.http.get<readonly ActivationView[]>(`${B2B_API_BASE}/admin/activations`, {
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
