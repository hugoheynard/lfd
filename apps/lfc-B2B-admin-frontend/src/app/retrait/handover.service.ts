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
 *
 * 🔴 **Le chemin d'API a changé DEUX FOIS** — `/admin/production/handover` le
 * 2026-09-07, puis `/admin/handover` le 2026-09-10, quand la remise a pris son
 * propre contexte. L'API sert encore l'ancien préfixe, déprécié, le temps qu'un
 * onglet resté ouvert soit rechargé ; cet écran, lui, vise le nouveau.
 *
 * ⚠️ **La route de CET écran ne bouge pas**, et c'est ce qui rend les deux
 * déménagements sans danger : `/retrait/:token` est ce que le QR déjà parti dans
 * les courriels encode. La déplacer casserait chaque code entre les mains d'un
 * client — un chemin d'API se déprécie, un QR imprimé non.
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
