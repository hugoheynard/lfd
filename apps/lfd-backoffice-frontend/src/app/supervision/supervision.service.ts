import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DaySupervisionView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * La **Supervision du jour**, telle que le serveur la calcule : le flux par
 * acheminement, les retards et leur règle, les commandes sans date.
 *
 * Aucun état : l'écran relit périodiquement, et les règles de retard vivent
 * côté serveur (`documentation/order/plan-supervision-du-jour.md`) — les
 * rejouer ici ferait deux vérités sur ce qui est « en retard ».
 */
@Injectable({ providedIn: 'root' })
export class SupervisionService {
  private readonly http = inject(HttpClient);

  /** La vue d'une date de service, `AAAA-MM-JJ`. */
  async day(date: string): Promise<DaySupervisionView> {
    return firstValueFrom(
      this.http.get<DaySupervisionView>(
        `${B2B_API_BASE}/admin/supervision/day?date=${encodeURIComponent(date)}`,
      ),
    );
  }
}
