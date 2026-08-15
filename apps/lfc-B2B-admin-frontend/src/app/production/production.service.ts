import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProductionBatchView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Ce que le **labo** doit fabriquer pour une journée de service.
 *
 * Aucun état : l'écran demande un jour, obtient un lot, l'imprime. Garder le
 * dernier lot en mémoire ferait imprimer hier au premier clic distrait.
 */
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly http = inject(HttpClient);

  /** Le lot d'une journée de service (`AAAA-MM-JJ`). */
  async batch(date: string): Promise<ProductionBatchView> {
    return firstValueFrom(
      this.http.get<ProductionBatchView>(
        `${B2B_API_BASE}/admin/production/batch?date=${encodeURIComponent(date)}`,
      ),
    );
  }
}
