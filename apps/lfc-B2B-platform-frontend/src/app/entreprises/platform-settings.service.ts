import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PlatformSettings } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';

/**
 * Réglages **globaux** de la plateforme côté client — de simples *feature flags*
 * d'activation (route publique). Chargés une fois, exposés en signal. Sert à
 * **masquer** les pièces `hidden` (ex. la livraison tant que le service n'existe
 * pas). En cas d'échec réseau, on garde `null` → tout reste visible (défaut sûr).
 */
@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private readonly http = inject(HttpClient);

  private readonly _settings = signal<PlatformSettings | null>(null);
  readonly settings = this._settings.asReadonly();

  /** La livraison est-elle masquée (service absent) ? */
  readonly deliveryHidden = computed(() => this._settings()?.delivery === 'hidden');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this._settings.set(
        await firstValueFrom(
          this.http.get<PlatformSettings>(`${AUTH_CONFIG.apiBaseUrl}/platform-settings`),
        ),
      );
    } catch {
      // Feature flags injoignables : on n'empêche pas l'app de tourner.
    }
  }
}
