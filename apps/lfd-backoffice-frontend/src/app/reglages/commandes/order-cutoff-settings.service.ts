import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { OrderCutoffSettingsPatch, OrderCutoffSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **L'interrupteur de l'heure limite générale** — Réglages › Commandes › Heure
 * limite (`documentation/commandes/plan-reglages-commandes.md`, §8.1, lot O3).
 *
 * Le serveur rend une vue même quand personne n'a rien réglé : activée,
 * `updatedAt` et `updatedBy` à `null`.
 */
@Injectable({ providedIn: 'root' })
export class OrderCutoffSettingsService {
  private readonly http = inject(HttpClient);

  read(): Promise<OrderCutoffSettingsView> {
    return firstValueFrom(this.http.get<OrderCutoffSettingsView>(this.url()));
  }

  /** `204` sans corps : l'appelant relit. */
  update(patch: OrderCutoffSettingsPatch): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.url(), patch));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/order-cutoff-settings`;
  }
}
