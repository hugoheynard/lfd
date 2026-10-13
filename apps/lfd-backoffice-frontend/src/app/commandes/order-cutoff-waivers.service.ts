import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedOrderCutoffWaiverResponse,
  OpenOrderCutoffWaiverView,
  OrderCutoffWaiverPayload,
  OrderCutoffWaiverView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Dérogations d'heure limite** — autoriser un client à commander en retard
 * pour une journée donnée.
 *
 * Murée côté serveur par `b2b_order_waivers`, une ressource distincte de la
 * saisie de commande : quelqu'un qui prend des commandes toute la journée n'a
 * pas forcément le droit de rouvrir une journée de production close. L'écran le
 * relit avant de proposer le geste, plutôt que d'offrir un bouton qui répondrait
 * 403.
 */
@Injectable({ providedIn: 'root' })
export class OrderCutoffWaiversService {
  private readonly http = inject(HttpClient);

  async listFor(companyId: string): Promise<readonly OrderCutoffWaiverView[]> {
    return firstValueFrom(
      this.http.get<readonly OrderCutoffWaiverView[]>(
        `${B2B_API_BASE}/admin/order-cutoff-waivers/${companyId}`,
      ),
    );
  }

  /**
   * Toutes les dérogations dont la journée n'est pas passée, servies ou non —
   * la liste de Réglages › Commandes › Heure limite (plan-reglages-commandes.md, O1c).
   */
  async listOpen(): Promise<readonly OpenOrderCutoffWaiverView[]> {
    return firstValueFrom(
      this.http.get<readonly OpenOrderCutoffWaiverView[]>(
        `${B2B_API_BASE}/admin/order-cutoff-waivers`,
      ),
    );
  }

  /** Retire une dérogation qui n'a pas servi ; le serveur refuse (404) une dérogation servie. */
  async revoke(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/order-cutoff-waivers/${id}`),
    );
  }

  async grant(payload: OrderCutoffWaiverPayload): Promise<CreatedOrderCutoffWaiverResponse> {
    return firstValueFrom(
      this.http.post<CreatedOrderCutoffWaiverResponse>(
        `${B2B_API_BASE}/admin/order-cutoff-waivers`,
        payload,
      ),
    );
  }
}
