import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PayerBillingModeView, SetPayerBillingModePayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/accounting/legal-entities`;

/**
 * **Le mode de facturation d'un client** chez une entité émettrice (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16, M4b).
 *
 * Transport pur : la prise d'effet, le verrou « un seul changement à la
 * fois » et les clôtures à venir arrivent calculés. Un refus (site facturé
 * chez un autre, changement déjà programmé) revient avec les mots du serveur.
 */
@Injectable({ providedIn: 'root' })
export class PayerBillingModeService {
  private readonly http = inject(HttpClient);

  async get(legalEntityId: string, companyId: string): Promise<PayerBillingModeView> {
    return firstValueFrom(this.http.get<PayerBillingModeView>(this.url(legalEntityId, companyId)));
  }

  async set(
    legalEntityId: string,
    companyId: string,
    payload: SetPayerBillingModePayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(legalEntityId, companyId), payload));
  }

  async cancelScheduled(legalEntityId: string, companyId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url(legalEntityId, companyId)}/scheduled`));
  }

  private url(legalEntityId: string, companyId: string): string {
    return `${BASE}/${encodeURIComponent(legalEntityId)}/payers/${encodeURIComponent(companyId)}/billing-mode`;
  }
}
