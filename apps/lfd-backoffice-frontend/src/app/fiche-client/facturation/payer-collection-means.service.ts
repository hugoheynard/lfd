import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PayerCollectionMeansView, SetPayerCollectionMeansPayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/accounting/legal-entities`;

/**
 * **Le moyen d'encaissement d'un payeur** — prélèvement SEPA ou virement
 * bancaire — chez une entité émettrice (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, V1,
 * V2, V10).
 *
 * Transport pur : la date d'effet est posée par le serveur (immédiate pour un
 * payeur qui n'a jamais commandé, sinon la prochaine clôture). Un refus — un
 * changement déjà programmé, un retour bancaire en cours, un site facturé
 * chez un autre — revient avec les mots du serveur.
 */
@Injectable({ providedIn: 'root' })
export class PayerCollectionMeansService {
  private readonly http = inject(HttpClient);

  async get(legalEntityId: string, companyId: string): Promise<PayerCollectionMeansView> {
    return firstValueFrom(
      this.http.get<PayerCollectionMeansView>(this.url(legalEntityId, companyId)),
    );
  }

  async set(
    legalEntityId: string,
    companyId: string,
    payload: SetPayerCollectionMeansPayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(legalEntityId, companyId), payload));
  }

  async cancelScheduled(legalEntityId: string, companyId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url(legalEntityId, companyId)}/scheduled`));
  }

  private url(legalEntityId: string, companyId: string): string {
    return `${BASE}/${encodeURIComponent(legalEntityId)}/payers/${encodeURIComponent(companyId)}/collection-means`;
  }
}
