import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdvanceLeadStatusPayload,
  CaptureLeadPayload,
  CreatedLeadResponse,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Leads **cold** (démarchage) — saisie + mutations de pipeline. Staff-gated,
 * même auth que le reste de l'admin (token relayé par le shell ; `null` en
 * dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly http = inject(HttpClient);

  /** Saisit un lead cold. */
  async capture(payload: CaptureLeadPayload): Promise<CreatedLeadResponse> {
    return firstValueFrom(
      this.http.post<CreatedLeadResponse>(`${B2B_API_BASE}/admin/leads`, payload),
    );
  }

  /** Fait avancer un lead dans le pipeline (contacté / qualifié / … / converti / perdu). */
  async changeStatus(id: string, payload: AdvanceLeadStatusPayload): Promise<void> {
    await firstValueFrom(this.http.patch<void>(`${B2B_API_BASE}/admin/leads/${id}`, payload));
  }
}
