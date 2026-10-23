import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AttestBankReturnCheckPayload,
  CreatedIdResponse,
  WithdrawBankReturnCheckPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **« Retours contrôlés »** — l'attestation du contrôle quotidien des retours
 * de la banque (plan `plan-page-procedure-de-prelevement.md` § 1.2, P3).
 * Écrire demande `b2b_accounting:write` ; la lecture passe par l'état de la
 * procédure. Une attestation ne conditionne aucun geste : elle ne gouverne
 * que l'onglet 4.
 */
@Injectable({ providedIn: 'root' })
export class BankReturnChecksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/bank-return-checks`;

  /** Atteste le jour — aujourd'hui sans `day` ; 409 s'il l'est déjà. */
  async attest(legalEntityId: string, day: string | null): Promise<CreatedIdResponse> {
    const payload: AttestBankReturnCheckPayload =
      day === null ? { legalEntityId } : { legalEntityId, day };
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.base, payload));
  }

  /** Retire l'attestation d'un jour : une ligne de plus, avec sa raison. */
  async withdraw(legalEntityId: string, day: string, note: string): Promise<CreatedIdResponse> {
    const payload: WithdrawBankReturnCheckPayload = { legalEntityId, day, note };
    return firstValueFrom(this.http.post<CreatedIdResponse>(`${this.base}/withdrawn`, payload));
  }
}
