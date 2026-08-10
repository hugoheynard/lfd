import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderHandoverView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * La **remise au comptoir**, côté staff. Deux appels et rien d'autre : lire ce
 * qu'un QR désigne, puis attester.
 *
 * Sans état : chaque scan est un événement isolé, et deux remises successives
 * n'ont rien à se transmettre. La confirmation rend d'ailleurs la vue à jour, ce
 * qui évite un rechargement — c'est le back-office qui décide, pas l'écran.
 */
@Injectable({ providedIn: 'root' })
export class HandoverService {
  private readonly http = inject(HttpClient);

  /** Ce qu'il y a derrière ce jeton — avant de confirmer quoi que ce soit. */
  async byToken(token: string): Promise<OrderHandoverView> {
    return firstValueFrom(
      this.http.get<OrderHandoverView>(
        `${B2B_API_BASE}/admin/handover/${encodeURIComponent(token)}`,
      ),
    );
  }

  /** Atteste la remise ; rend l'attestation obtenue (qui, quand). */
  async confirm(token: string): Promise<OrderHandoverView> {
    return firstValueFrom(
      this.http.post<OrderHandoverView>(
        `${B2B_API_BASE}/admin/handover/${encodeURIComponent(token)}`,
        {},
      ),
    );
  }
}
