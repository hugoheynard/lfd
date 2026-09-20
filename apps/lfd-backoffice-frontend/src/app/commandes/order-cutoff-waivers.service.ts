import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreatedOrderCutoffWaiverResponse,
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

  async grant(payload: OrderCutoffWaiverPayload): Promise<CreatedOrderCutoffWaiverResponse> {
    return firstValueFrom(
      this.http.post<CreatedOrderCutoffWaiverResponse>(
        `${B2B_API_BASE}/admin/order-cutoff-waivers`,
        payload,
      ),
    );
  }
}
