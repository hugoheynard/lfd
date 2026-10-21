import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { OrderCutoffSettingsPatch, OrderCutoffSettingsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Le jour même** — Réglages › Commandes › Jour même (2026-10-21 ;
 * l'interrupteur de l'heure limite générale qu'il portait est retiré).
 *
 * Le serveur rend une vue même quand personne n'a rien réglé : jour même
 * fermé, `updatedAt` et `updatedBy` à `null`.
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
