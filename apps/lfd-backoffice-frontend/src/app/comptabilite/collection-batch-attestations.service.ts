import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AttestCollectionBatchPayload,
  BatchAttestationKindView,
  CreatedIdResponse,
  WithdrawCollectionBatchAttestationPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les attestations d'un lot** — contrôle CSV relu, remise signée sur CENET,
 * comptes rendus PSR lus (plan `plan-page-procedure-de-prelevement.md` § 1.2,
 * P3). Écrire demande `b2b_accounting:write` ; la lecture passe par l'état de
 * la procédure. Une attestation ne conditionne aucun geste : elle ne gouverne
 * que l'onglet 3.
 */
@Injectable({ providedIn: 'root' })
export class CollectionBatchAttestationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/collection/batches`;

  /** Atteste une sorte ; 409 si elle l'est déjà ou si le lot n'en est pas là. */
  async attest(batchId: string, kind: BatchAttestationKindView): Promise<CreatedIdResponse> {
    const payload: AttestCollectionBatchPayload = { kind };
    return firstValueFrom(
      this.http.post<CreatedIdResponse>(`${this.base}/${batchId}/attestations`, payload),
    );
  }

  /** Retire une sorte : une ligne de plus, avec sa raison. */
  async withdraw(
    batchId: string,
    kind: BatchAttestationKindView,
    note: string,
  ): Promise<CreatedIdResponse> {
    const payload: WithdrawCollectionBatchAttestationPayload = { kind, note };
    return firstValueFrom(
      this.http.post<CreatedIdResponse>(`${this.base}/${batchId}/attestations/withdrawn`, payload),
    );
  }
}
