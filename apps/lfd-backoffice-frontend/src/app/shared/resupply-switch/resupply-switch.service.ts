import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ResupplySwitchPayload, ResupplySwitchView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **L'interrupteur du réassort** — Réglages › Production › Fournil (plan
 * `reassort-boutiques/plan-interrupteur-du-reassort.md`).
 *
 * La pose est idempotente côté serveur (`@Idempotent` : rejouer pose le même
 * état) : aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class ResupplySwitchService {
  private readonly http = inject(HttpClient);

  read(): Promise<ResupplySwitchView> {
    return firstValueFrom(this.http.get<ResupplySwitchView>(this.url()));
  }

  /** Allume ou éteint le réassort. `204` sans corps : l'appelant relit. */
  set(payload: ResupplySwitchPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/resupply-switch`;
  }
}
