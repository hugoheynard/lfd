import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdvanceLeadStatusPayload,
  CaptureLeadPayload,
  CreatedLeadResponse,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { SuiteEmbed } from '../suite-embed/suite-embed';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Leads **cold** (démarchage) — saisie + mutations de pipeline. Staff-gated,
 * même auth que le reste de l'admin (token relayé par le shell ; `null` en
 * dev/standalone → aucun en-tête, bypass backend). Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  /** Saisit un lead cold. */
  async capture(payload: CaptureLeadPayload): Promise<CreatedLeadResponse> {
    return firstValueFrom(
      this.http.post<CreatedLeadResponse>(
        `${B2B_API_BASE}/admin/leads`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** Fait avancer un lead dans le pipeline (contacté / qualifié / … / converti / perdu). */
  async changeStatus(id: string, payload: AdvanceLeadStatusPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/leads/${id}`,
        payload,
        await this.staffOptions(),
      ),
    );
  }

  /** En-tête `Authorization` staff, ou vide en dev/standalone (bypass backend). */
  private async staffOptions(): Promise<{ headers: Record<string, string> }> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return { headers: token === null ? {} : { Authorization: `Bearer ${token}` } };
  }
}
