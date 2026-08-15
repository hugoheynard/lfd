import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AdminSubscriptionRow } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **paniers récurrents d'un compte**, vus du staff.
 *
 * Lecture seule : suspendre ou reprendre l'abonnement d'un client est une
 * mutation sur son engagement, qui aura sa propre trace et sa propre décision.
 */
@Injectable({ providedIn: 'root' })
export class AdminSubscriptionsService {
  private readonly http = inject(HttpClient);

  /** Les paniers des membres de cette société, plus récents d'abord. */
  async listForCompany(companyId: string): Promise<readonly AdminSubscriptionRow[]> {
    return firstValueFrom(
      this.http.get<readonly AdminSubscriptionRow[]>(
        `${B2B_API_BASE}/admin/companies/${companyId}/subscriptions`,
      ),
    );
  }
}
