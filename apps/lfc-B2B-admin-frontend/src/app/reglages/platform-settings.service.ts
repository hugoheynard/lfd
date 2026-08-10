import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PlatformSettings } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Réglages **globaux** de la plateforme (config des pièces d'activation). La
 * **lecture** est publique (feature flags, non sensible) ; l'**écriture** est
 * staff — le jeton est attaché par `staffAuthInterceptor`, pas ici.
 */
@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private readonly http = inject(HttpClient);

  /** Lit la config (route publique, aucun en-tête requis). */
  get(): Promise<PlatformSettings> {
    return firstValueFrom(this.http.get<PlatformSettings>(`${B2B_API_BASE}/platform-settings`));
  }

  /** Remplace la config (staff). */
  async save(settings: PlatformSettings): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/platform-settings`, settings),
    );
  }
}
