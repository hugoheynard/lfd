import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { SuiteEmbed } from '../suite-embed/suite-embed';
import type { AdminCompany } from './admin-company';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Accès à la surface **admin** du backend B2B.
 *
 * Auth : on demande au shell un token pour l'audience staff (Invariant C — jamais
 * le token client). Embarqué en prod, le shell le relaie ; standalone ou en dev
 * (bypass backend), `requestToken` rend `null` → aucun en-tête, et le backend en
 * bypass laisse passer. Le jour où l'audience staff existe côté shell, la même
 * ligne fournit le vrai token.
 */
@Injectable({ providedIn: 'root' })
export class AdminCompaniesService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly AdminCompany[]> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    const headers = token === null ? {} : { Authorization: `Bearer ${token}` };
    return firstValueFrom(
      this.http.get<readonly AdminCompany[]>(`${B2B_API_BASE}/admin/companies`, { headers }),
    );
  }
}
