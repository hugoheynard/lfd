import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CockpitHandoversView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les remises du jour, en chiffres** — `GET /admin/cockpit/handovers`, sous le
 * droit du cockpit (`b2b_growth`).
 *
 * Une route par usage : le cockpit ne lit plus la file du comptoir, qui portait
 * chaque commande et, pour une livraison, sa tournée. Il reçoit les quatre
 * nombres qu'il affiche. Transport pur.
 */
@Injectable({ providedIn: 'root' })
export class CockpitHandoversService {
  private readonly http = inject(HttpClient);

  /** `day` au format `AAAA-MM-JJ`. */
  async forDay(day: string): Promise<CockpitHandoversView> {
    return firstValueFrom(
      this.http.get<CockpitHandoversView>(
        `${B2B_API_BASE}/admin/cockpit/handovers?jour=${encodeURIComponent(day)}`,
      ),
    );
  }
}
