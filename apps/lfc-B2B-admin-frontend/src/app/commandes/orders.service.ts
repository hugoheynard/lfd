import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminOrderRow,
  AdminOrdersQuery,
  AdminPlaceOrderPayload,
  AdminPlacedOrderResponse,
  OrderView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **commandes vues du staff**. Une surface à part de celle du client : ces
 * routes ne demandent pas d'être le client ni membre de la société — ce qu'un
 * commercial n'est ni l'un ni l'autre.
 *
 * Aucun état ici : deux écrans (la liste d'un compte, le détail d'une commande)
 * ne partagent rien et se chargent chacun pour soi.
 */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);

  /** Les commandes, la plus récente en tête. Filtres optionnels. */
  async list(filters: Partial<AdminOrdersQuery> = {}): Promise<readonly AdminOrderRow[]> {
    const params = new URLSearchParams();
    if (filters.companyId !== undefined) {
      params.set('companyId', filters.companyId);
    }
    if (filters.status !== undefined) {
      params.set('status', filters.status);
    }
    if (filters.limit !== undefined) {
      params.set('limit', `${filters.limit}`);
    }
    const query = params.toString();
    return firstValueFrom(
      this.http.get<readonly AdminOrderRow[]>(
        `${B2B_API_BASE}/admin/orders${query === '' ? '' : `?${query}`}`,
      ),
    );
  }

  /** Une commande, dans la même vue que celle du client — délibérément. */
  async byId(id: string): Promise<OrderView> {
    return firstValueFrom(
      this.http.get<OrderView>(`${B2B_API_BASE}/admin/orders/${encodeURIComponent(id)}`),
    );
  }

  /**
   * Passe une commande **au nom d'un client**. Aucun prix n'est envoyé : le
   * serveur les ré-résout, et c'est lui qui rend le total et l'éventuel lien de
   * règlement.
   */
  async place(payload: AdminPlaceOrderPayload): Promise<AdminPlacedOrderResponse> {
    return firstValueFrom(
      this.http.post<AdminPlacedOrderResponse>(`${B2B_API_BASE}/admin/orders`, payload),
    );
  }
}
