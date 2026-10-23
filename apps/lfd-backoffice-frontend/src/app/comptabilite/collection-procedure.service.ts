import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CollectionProcedureView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La procédure de prélèvement** — la lecture d'état de la page du même nom
 * (plan `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * S1). Une lecture seulement : les gestes restent aux cartes et aux lots.
 */
@Injectable({ providedIn: 'root' })
export class CollectionProcedureService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/collection-procedure`;

  /** L'état des quatre onglets ; `batchId` épingle le lot suivi (404 s'il n'est pas de l'entité). */
  async read(legalEntityId: string, batchId: string | null): Promise<CollectionProcedureView> {
    const params: Record<string, string> =
      batchId === null ? { legalEntityId } : { legalEntityId, batchId };
    return firstValueFrom(this.http.get<CollectionProcedureView>(this.base, { params }));
  }
}
