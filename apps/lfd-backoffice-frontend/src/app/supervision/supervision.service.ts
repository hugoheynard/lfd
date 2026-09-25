import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  DaySupervisionView,
  HandoverQueueView,
  ProductionPackingView,
  ProductionWorksheetView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les quatre lectures de la Supervision du jour**, toutes sous
 * `b2b_supervision:read` (`documentation/order/plan-supervision-du-jour.md`, §3).
 *
 * Chacune rejoue au serveur la query du poste qui opère — fiche d'atelier,
 * colisage, file de retrait — et rend donc EXACTEMENT son contrat : l'écran
 * lit les mêmes types que les postes, sans en dériver un second. Ce qui change,
 * c'est la porte : `admin/supervision/*` ne demande pas `b2b_orders`, qui
 * ouvrirait les postes en écriture.
 *
 * Aucun état : la page relit périodiquement, et les règles de retard vivent
 * au serveur — les rejouer ici ferait deux vérités sur ce qui est « en retard ».
 */
@Injectable({ providedIn: 'root' })
export class SupervisionService {
  private readonly http = inject(HttpClient);

  /**
   * Les retards d'une date de service. **Sans date**, le serveur rend le jour
   * courant de SON horloge : c'est ainsi que l'écran apprend quel jour il
   * supervise — l'horloge du poste n'est pas une autorité (plan §5).
   */
  async day(date?: string): Promise<DaySupervisionView> {
    const query = date === undefined ? '' : `?date=${encodeURIComponent(date)}`;
    return firstValueFrom(
      this.http.get<DaySupervisionView>(`${B2B_API_BASE}/admin/supervision/day${query}`),
    );
  }

  /** La fiche d'atelier du jour, par rayon — le même contrat que `production/worksheet`. */
  async preparation(date: string): Promise<ProductionWorksheetView> {
    return firstValueFrom(
      this.http.get<ProductionWorksheetView>(
        `${B2B_API_BASE}/admin/supervision/preparation?date=${encodeURIComponent(date)}`,
      ),
    );
  }

  /** Les bacs du jour — le même contrat que `production/packing`. */
  async packing(date: string): Promise<ProductionPackingView> {
    return firstValueFrom(
      this.http.get<ProductionPackingView>(
        `${B2B_API_BASE}/admin/supervision/packing?date=${encodeURIComponent(date)}`,
      ),
    );
  }

  /** La file de retrait du jour — le même contrat que `handover/file`. */
  async handover(day: string): Promise<HandoverQueueView> {
    return firstValueFrom(
      this.http.get<HandoverQueueView>(
        `${B2B_API_BASE}/admin/supervision/handover?jour=${encodeURIComponent(day)}`,
      ),
    );
  }
}
