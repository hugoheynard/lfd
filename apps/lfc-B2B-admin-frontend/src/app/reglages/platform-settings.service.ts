import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PlatformSettings } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { SuiteEmbed } from '../suite-embed/suite-embed';

/** Audience du token staff (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Réglages **globaux** de la plateforme (config des pièces d'activation). La
 * **lecture** est publique (feature flags, non sensible) ; l'**écriture** est
 * staff (token pour l'audience admin, comme les autres mutations).
 */
@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  /** Lit la config (route publique, aucun en-tête requis). */
  get(): Promise<PlatformSettings> {
    return firstValueFrom(this.http.get<PlatformSettings>(`${B2B_API_BASE}/platform-settings`));
  }

  /** Remplace la config (staff). */
  async save(settings: PlatformSettings): Promise<void> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    const headers = token === null ? {} : { Authorization: `Bearer ${token}` };
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/platform-settings`, settings, { headers }),
    );
  }
}
