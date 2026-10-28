import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ProductionContainerRule, ProductionContainerView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const CONTAINERS = `${B2B_API_BASE}/admin/production/containers`;

/**
 * **Le contenant principal de chaque produit** — celui du gros bouton « + 1
 * plaque » de la fiche d'atelier (plan `documentation/fournil/plan-fournee-v3.md`,
 * §5). Lu sous `production_worksheet:read` ou `production_settings:read`, réglé
 * sous `production_settings:write`.
 *
 * Aucun état : l'écran relit après chaque écriture. Les refus remontent tels
 * quels.
 */
@Injectable({ providedIn: 'root' })
export class ProductionContainersService {
  private readonly http = inject(HttpClient);

  list(): Promise<readonly ProductionContainerView[]> {
    return firstValueFrom(this.http.get<readonly ProductionContainerView[]>(CONTAINERS));
  }

  /** `PUT` : un SKU n'a qu'un contenant, le reposer le remplace. */
  async set(sku: string, rule: ProductionContainerRule): Promise<void> {
    await firstValueFrom(this.http.put(`${CONTAINERS}/${encodeURIComponent(sku)}`, rule));
  }

  async remove(sku: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${CONTAINERS}/${encodeURIComponent(sku)}`));
  }
}
