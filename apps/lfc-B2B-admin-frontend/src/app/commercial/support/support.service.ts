import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SupportRequestView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Transport des **demandes de contact** — « rappelez-moi », « répondez-moi par
 * e-mail ». La route existait depuis la reprise du `SupportRequest` et n'avait
 * **aucun consommateur** : une demande déposée par un client tombait dans un
 * trou. C'est ce service qui la remonte, et qui la clôt.
 *
 * Transport pur, comme les autres services de l'admin.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);
  private readonly base = `${B2B_API_BASE}/admin/support-requests`;

  /** Les demandes **ouvertes** ; `all` rend aussi celles déjà traitées. */
  async list(all = false): Promise<readonly SupportRequestView[]> {
    const url = all ? `${this.base}?all=true` : this.base;
    return firstValueFrom(
      this.http.get<readonly SupportRequestView[]>(url, { headers: await this.authHeaders() }),
    );
  }

  /** Marque la demande **traitée** — l'action qui vide la file. */
  async handle(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${id}/handle`, null, {
        headers: await this.authHeaders(),
      }),
    );
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  }
}
