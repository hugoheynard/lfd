import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PortfolioMetricsView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * L'**état du portefeuille** : ce que la liste des comptes ne dit pas d'elle-même
 * — combien on en sert, combien viennent d'arriver, lesquels montent ou
 * descendent, et ce qui reste à encaisser.
 *
 * Servi par `growth/` et non par le dossier client : ces chiffres lisent les
 * commandes, et le dossier client n'a pas à en connaître l'existence.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioMetricsService {
  private readonly http = inject(HttpClient);

  load(): Promise<PortfolioMetricsView> {
    return firstValueFrom(
      this.http.get<PortfolioMetricsView>(`${B2B_API_BASE}/admin/growth/portfolio`),
    );
  }
}
