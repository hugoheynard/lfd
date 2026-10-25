import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PackingSettingsPayload, PackingSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les réglages du colisage** — Réglages › Colisage (Hugo, 2026-10-25), dont
 * le partage d'une moitié de bac, fermé par défaut.
 *
 * Lu par la page de réglage (`delivery_settings:read`) ET par le poste
 * (`production_packing:read`), qui ne montre « Partager une moitié » que s'il
 * est ouvert. Le serveur rend une vue même quand personne n'a rien réglé.
 */
@Injectable({ providedIn: 'root' })
export class PackingSettingsService {
  private readonly http = inject(HttpClient);

  read(): Promise<PackingSettingsView> {
    return firstValueFrom(this.http.get<PackingSettingsView>(this.url()));
  }

  /** Pose les réglages. `204` sans corps : l'appelant relit. */
  update(payload: PackingSettingsPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/packing/settings`;
  }
}
