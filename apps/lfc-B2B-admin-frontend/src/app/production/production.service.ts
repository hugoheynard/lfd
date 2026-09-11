import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProductionBatchView, ProductionForecastView } from '@lfd/contracts';

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

  /**
   * Le **prévisionnel** d'une plage de jours de service, bornes comprises.
   *
   * Une seule lecture pour toute la plage, et pas un lot par jour : la question
   * n'est pas « que fabrique-t-on », mais « quand est-ce que ça tombe ». Sept
   * appels rendraient sept réponses qu'il faudrait recoller ici, et le pic —
   * qui vient du serveur exprès — n'en ferait plus partie.
   */
  async forecast(from: string, to: string): Promise<ProductionForecastView> {
    return firstValueFrom(
      this.http.get<ProductionForecastView>(
        `${B2B_API_BASE}/admin/production/forecast?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    );
  }

  /** Le lot d'une journée de service (`AAAA-MM-JJ`). */
  async batch(date: string): Promise<ProductionBatchView> {
    return firstValueFrom(
      this.http.get<ProductionBatchView>(
        `${B2B_API_BASE}/admin/production/batch?date=${encodeURIComponent(date)}`,
      ),
    );
  }
}
