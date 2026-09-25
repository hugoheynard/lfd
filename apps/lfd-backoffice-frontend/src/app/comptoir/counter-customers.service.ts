import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CounterCustomerCard, CounterCustomerView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les clients vus du comptoir** — sous `b2b_counter:read`, jamais sous
 * `b2b_companies`.
 *
 * Le vendeur de comptoir n'a pas la fiche client (crédit, KBIS, contacts) ; il
 * a ce qu'il faut pour vendre (`documentation/order/plan-commande-au-comptoir.md`).
 * Lire ces sociétés par `AdminCompaniesService` le condamnerait au 403.
 */
@Injectable({ providedIn: 'root' })
export class CounterCustomersService {
  private readonly http = inject(HttpClient);

  /** Les cartes de recherche — les sociétés actives seulement, filtrées par le serveur. */
  list(): Promise<readonly CounterCustomerCard[]> {
    return firstValueFrom(
      this.http.get<readonly CounterCustomerCard[]>(`${B2B_API_BASE}/admin/counter/customers`),
    );
  }

  /**
   * Le détail d'un client. Une société inconnue OU non active répond 404, avec
   * un message pour le personnel : l'erreur remonte telle quelle à l'écran.
   */
  get(id: string): Promise<CounterCustomerView> {
    return firstValueFrom(
      this.http.get<CounterCustomerView>(
        `${B2B_API_BASE}/admin/counter/customers/${encodeURIComponent(id)}`,
      ),
    );
  }
}
