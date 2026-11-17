import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  PRODUCTION_GROUPING_SKUS_MAX,
  type CreatedIdResponse,
  type PlaceProductsPayload,
  type ProductionGrouping,
  type ProductionGroupingView,
  type ProductionTrackingLevel,
  type UnplacedProductsOfDayView,
  type WorkstationsPageView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const WORKSTATIONS = `${B2B_API_BASE}/admin/production/workstations`;

/**
 * **Les postes du fournil** (`documentation/fournil/les-postes-du-fournil.md`, § 3.7 à
 * § 3.11) — la page Postes, le rangement servi aux écrans du fournil, et
 * l'alerte du Prod manager.
 *
 * Aucun état : l'écran relit après chaque écriture. Chaque écriture est **par
 * intention** (`Idempotency-Key`) : rejouer un renommage après celui de
 * quelqu'un d'autre le déferait.
 */
@Injectable({ providedIn: 'root' })
export class WorkstationsService {
  private readonly http = inject(HttpClient);

  page(): Promise<WorkstationsPageView> {
    return firstValueFrom(this.http.get<WorkstationsPageView>(WORKSTATIONS));
  }

  async declare(name: string, intentKey: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(WORKSTATIONS, { name }, intentOptions(intentKey)),
    );
    return created.id;
  }

  async rename(id: string, name: string, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.put(
        `${WORKSTATIONS}/${encodeURIComponent(id)}/name`,
        { name },
        intentOptions(intentKey),
      ),
    );
  }

  async reorder(ids: readonly string[], intentKey: string): Promise<void> {
    await firstValueFrom(this.http.put(`${WORKSTATIONS}/order`, { ids }, intentOptions(intentKey)));
  }

  /** Le niveau de suivi propre au poste ; `null` : il suit le fournil. */
  async setTrackingLevel(
    id: string,
    trackingLevel: ProductionTrackingLevel | null,
    intentKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put(
        `${WORKSTATIONS}/${encodeURIComponent(id)}/tracking-level`,
        { trackingLevel },
        intentOptions(intentKey),
      ),
    );
  }

  async archive(id: string, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${WORKSTATIONS}/${encodeURIComponent(id)}/archive`,
        {},
        intentOptions(intentKey),
      ),
    );
  }

  async place(payload: PlaceProductsPayload, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${WORKSTATIONS}/placements`, payload, intentOptions(intentKey)),
    );
  }

  /**
   * Le rangement de ces SKU selon le réglage du fournil (§ 3.7) — une LECTURE
   * en `POST`. Au-delà de la borne du serveur, la liste est coupée : c'est le
   * signe que le catalogue a changé d'échelle, et les SKU coupés retombent
   * dans le repli de l'écran.
   */
  grouping(skus: readonly string[]): Promise<ProductionGroupingView> {
    const distinct = [...new Set(skus)].slice(0, PRODUCTION_GROUPING_SKUS_MAX);
    return firstValueFrom(
      this.http.post<ProductionGroupingView>(`${WORKSTATIONS}/grouping`, { skus: distinct }),
    );
  }

  /** Les produits du jour sans poste — l'alerte du Prod manager (§ 3.10). */
  unplaced(date: string): Promise<UnplacedProductsOfDayView> {
    return firstValueFrom(
      this.http.get<UnplacedProductsOfDayView>(`${WORKSTATIONS}/unplaced`, {
        params: { date },
      }),
    );
  }

  /** Le dossier de prod simulé : rangé dans ce mode, sous-catégories affichées ou non (§ 3.11). */
  simulationPdf(mode: ProductionGrouping, showSubcategories: boolean): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/production/simulation.pdf`, {
        params: { mode, showSubcategories: String(showSubcategories) },
        responseType: 'blob',
      }),
    );
  }
}
