import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  BinCapacitiesView,
  BinTypePayload,
  BinTypesView,
  SetBinCapacityPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const BINS = `${B2B_API_BASE}/admin/livraison/bacs`;
const CAPACITIES = `${B2B_API_BASE}/admin/livraison/contenances`;

/**
 * **Les bacs de la livraison** — le catalogue des types et la grille des
 * contenances (`documentation/livraisons/plan-preparation-de-tournee.md`, lot
 * 4 bis v2, tranche A). Lecture sous `delivery_settings:read` ou
 * `delivery_rounds:read`, écriture sous `delivery_settings:write`.
 *
 * Aucun état, et les refus du serveur remontent tels quels : c'est le domaine
 * qui tient les bornes, et sa phrase est celle que l'écran montre.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryBinsService {
  private readonly http = inject(HttpClient);

  binTypes(): Promise<BinTypesView> {
    return firstValueFrom(this.http.get<BinTypesView>(BINS));
  }

  async addBinType(payload: BinTypePayload): Promise<void> {
    await firstValueFrom(this.http.post(BINS, payload));
  }

  async updateBinType(id: string, payload: BinTypePayload): Promise<void> {
    await firstValueFrom(this.http.put(`${BINS}/${encodeURIComponent(id)}`, payload));
  }

  async archiveBinType(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BINS}/${encodeURIComponent(id)}/archiver`, {}));
  }

  async reactivateBinType(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${BINS}/${encodeURIComponent(id)}/reactiver`, {}));
  }

  capacities(): Promise<BinCapacitiesView> {
    return firstValueFrom(this.http.get<BinCapacitiesView>(CAPACITIES));
  }

  async setCapacity(payload: SetBinCapacityPayload): Promise<void> {
    await firstValueFrom(this.http.put(CAPACITIES, payload));
  }
}
