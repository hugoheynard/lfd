import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderDeliveryVatPayload, OrderDeliveryVatView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La TVA de la livraison** — un réglage unique, toujours lisible.
 *
 * Contrairement à la surtaxe, la lecture n'est jamais `null` : sans réglage
 * posé, le serveur répond `standard` avec `configured: false`. Pas de `DELETE`
 * non plus — revenir au taux normal est un choix, il s'enregistre.
 */
@Injectable({ providedIn: 'root' })
export class OrderDeliveryVatService {
  private readonly http = inject(HttpClient);

  /** Le mode qui s'applique, et s'il a été choisi. */
  read(): Promise<OrderDeliveryVatView> {
    return firstValueFrom(this.http.get<OrderDeliveryVatView>(this.url()));
  }

  /** Pose le mode des commandes À VENIR ; celles déjà passées gardent le leur. */
  async save(payload: OrderDeliveryVatPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/order-delivery-vat`;
  }
}
