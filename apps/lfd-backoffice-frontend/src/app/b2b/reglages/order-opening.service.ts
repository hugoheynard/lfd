import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { OrderOpeningPatch, OrderOpeningView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **À quelles clientèles la boutique prend des commandes** — un réglage
 * unique, posé dans « E-commerce LFC → Réglages → Ouverture de la boutique ».
 *
 * Le serveur rend une vue même quand personne n'a rien réglé : ouverte aux
 * deux, `updatedAt` et `updatedBy` à `null`. Doc :
 * `documentation/order/ouverture-de-la-boutique.md`.
 */
@Injectable({ providedIn: 'root' })
export class OrderOpeningService {
  private readonly http = inject(HttpClient);

  read(): Promise<OrderOpeningView> {
    return firstValueFrom(this.http.get<OrderOpeningView>(this.url()));
  }

  /** Bascule une clientèle. `204` sans corps : l'appelant relit. */
  update(patch: OrderOpeningPatch): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.url(), patch));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/order-opening`;
  }
}
