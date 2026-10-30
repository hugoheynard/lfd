import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PickupAddressView, PromotionListView, PromotionView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les promotions** — `/admin/promotions` (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L7). Lecture sous `b2b_pricing` OU `b2b_settings`.
 *
 * Aucune écriture d'ici au lot L8 : tant que la source du calcul n'est pas
 * `promotions`, le serveur refuse toute écriture (409), et l'écran le dit.
 */
@Injectable({ providedIn: 'root' })
export class PromotionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/promotions`;

  /** Toutes, archivées comprises ; `pickupId` restreint à celles de ce point. */
  list(pickupId: string | null = null): Promise<PromotionListView> {
    const params =
      pickupId === null ? new HttpParams() : new HttpParams().set('pickupId', pickupId);
    return firstValueFrom(this.http.get<PromotionListView>(this.base, { params }));
  }

  get(id: string): Promise<PromotionView> {
    return firstValueFrom(this.http.get<PromotionView>(`${this.base}/${encodeURIComponent(id)}`));
  }

  /**
   * Les noms des points de retrait, pour remplacer leurs identifiants. Au
   * mieux : sans le droit de les lire, l'écran garde l'identifiant.
   */
  async pickupNames(): Promise<ReadonlyMap<string, string>> {
    try {
      const points = await firstValueFrom(
        this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/admin/pickup-addresses`),
      );
      return new Map(points.map((point) => [point.id, point.label]));
    } catch {
      return new Map();
    }
  }
}
