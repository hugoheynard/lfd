import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  BinCapacitiesView,
  BinTypePayload,
  BinTypesView,
  PurchaseAssistantPayload,
  PurchaseAssistantView,
  SetBinCapacityPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const BINS = `${B2B_API_BASE}/admin/livraison/bacs`;
const CAPACITIES = `${B2B_API_BASE}/admin/livraison/contenances`;
const PURCHASE_ASSISTANT = `${B2B_API_BASE}/admin/livraison/assistant-achat`;

/**
 * **Les bacs de la livraison** — le catalogue des types et la grille des
 * contenances (`documentation/livraisons/plan-preparation-de-tournee.md`, lot
 * 4 bis v2, tranche A). Lecture sous `delivery_settings:read` ou
 * `delivery_rounds:read`, écriture sous `delivery_settings:write`. Le
 * catalogue des types (`binTypes`) se lit aussi sous `production_packing:write`
 * depuis le 2026-10-07 : « + Nouveau bac » au colisage (audit du dossier
 * `livraisons/`, B4). La grille, elle, reste aux deux droits de livraison.
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

  /**
   * L'assistant d'achat (`plan-geometrie-du-plancher.md`, G-D3) : un POST
   * parce que le scénario est un corps, mais une LECTURE — rien n'est écrit,
   * sous `delivery_rounds:read`. Les refus 400 remontent tels quels.
   */
  assistPurchase(payload: PurchaseAssistantPayload): Promise<PurchaseAssistantView> {
    return firstValueFrom(this.http.post<PurchaseAssistantView>(PURCHASE_ASSISTANT, payload));
  }
}
