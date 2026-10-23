import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CollectionProcedureListView, CollectionProcedureView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Ce qu'une lecture de procédure désigne : la procédure de la table
 * (entité × clôture), ou l'entité seule — la règle du § 4.3 choisit alors le
 * lot (les anciennes adresses `?entite=&lot=`).
 */
export type ProcedureAddress =
  { readonly procedureId: string } | { readonly legalEntityId: string };

/**
 * **La procédure de prélèvement** — la table des procédures (§ 11) et la
 * lecture d'état d'une procédure (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * S1). Des lectures seulement : les gestes restent aux cartes et aux lots.
 */
@Injectable({ providedIn: 'root' })
export class CollectionProcedureService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting`;

  /** L'état des quatre onglets ; `batchId` épingle le lot suivi (404 s'il n'est pas de l'entité). */
  async read(address: ProcedureAddress, batchId: string | null): Promise<CollectionProcedureView> {
    const params: Record<string, string> = {
      ...address,
      ...(batchId === null ? {} : { batchId }),
    };
    return firstValueFrom(
      this.http.get<CollectionProcedureView>(`${this.base}/collection-procedure`, { params }),
    );
  }

  /** Les procédures de l'entité ; `includeClosed` ajoute les closes des trois derniers mois. */
  async list(legalEntityId: string, includeClosed: boolean): Promise<CollectionProcedureListView> {
    const params = { legalEntityId, includeClosed: String(includeClosed) };
    return firstValueFrom(
      this.http.get<CollectionProcedureListView>(`${this.base}/collection-procedures`, { params }),
    );
  }
}
