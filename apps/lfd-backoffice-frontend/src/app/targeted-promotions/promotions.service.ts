import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  PickupAddressView,
  SitePaletteView,
  PromotionListView,
  PromotionsSourceView,
  PromotionTermsPayload,
  PromotionView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';
import { DeliveryZonesService } from '../b2b/reglages/delivery-zones.service';

/**
 * **Les promotions** — `/admin/promotions` (`documentation/promotions/promotions.md`, § 2.9, lots L7-L8). Lecture sous `b2b_pricing` OU `lfc_site_settings`.
 *
 * L'écriture, de TOUTE promotion (« retrait à un point » compris), passe par
 * `/admin/promotions`, sous `b2b_pricing` seul : un seul endroit depuis le
 * 2026-10-31 (`documentation/promotions/promotions.md`, § 2.15).
 */
@Injectable({ providedIn: 'root' })
export class PromotionsService {
  private readonly http = inject(HttpClient);
  private readonly zones = inject(DeliveryZonesService);
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

  /** La source seule : les anciens éditeurs s'en disent en lecture seule. */
  source(): Promise<PromotionsSourceView> {
    return firstValueFrom(this.http.get<PromotionsSourceView>(`${this.base}/source`));
  }

  async pose(terms: PromotionTermsPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(this.base, terms));
    return created.id;
  }

  revise(id: string, terms: PromotionTermsPayload, reason: string | null): Promise<void> {
    return this.write(`${this.base}/${encodeURIComponent(id)}`, 'put', {
      terms,
      reason,
    });
  }

  pause(view: PromotionView, reason: string | null): Promise<void> {
    return this.gesture(view, 'pause', { reason });
  }

  resume(view: PromotionView, reason: string | null): Promise<void> {
    return this.gesture(view, 'resume', { reason });
  }

  archive(view: PromotionView, reason: string): Promise<void> {
    return this.gesture(view, 'archive', { reason });
  }

  private gesture(view: PromotionView, verb: string, body: object): Promise<void> {
    const path = `${this.base}/${encodeURIComponent(view.id)}/${verb}`;
    return this.write(path, 'post', body);
  }

  private async write(path: string, method: 'post' | 'put', body: object): Promise<void> {
    await firstValueFrom(this.http.request<void>(method, path, { body }));
  }

  /**
   * Les noms des points de retrait, pour remplacer leurs identifiants. Au
   * mieux : sans le droit de les lire, l'écran garde l'identifiant.
   */
  async pickupNames(): Promise<ReadonlyMap<string, string>> {
    return (await this.activePickupNames()) ?? new Map();
  }

  /**
   * Les points de retrait proposés aujourd'hui — les sites actifs ; `null`
   * quand la liste ne se lit pas (droit absent), pour qu'un point inconnu ne
   * soit pas dit archivé à tort.
   */
  async activePickupNames(): Promise<ReadonlyMap<string, string> | null> {
    try {
      const points = await firstValueFrom(
        this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/admin/pickup-addresses`),
      );
      return new Map(points.map((point) => [point.id, point.label]));
    } catch {
      return null;
    }
  }

  /**
   * Les noms de TOUS les sites, archivés compris (la palette de la
   * logistique) — pour nommer un point archivé qu'une promotion garde. Au
   * mieux : vide sans le droit de la lire.
   */
  async everySiteName(): Promise<ReadonlyMap<string, string>> {
    try {
      const palette = await firstValueFrom(
        this.http.get<SitePaletteView>(`${B2B_API_BASE}/admin/sites/palette`),
      );
      return new Map(palette.sites.map((site) => [site.id, site.label]));
    } catch {
      return new Map();
    }
  }

  /** Les zones de livraison, par leur nom (route publique) ; vide si elles ne se lisent pas. */
  async zoneNames(): Promise<ReadonlyMap<string, string>> {
    try {
      const zones = await this.zones.list();
      return new Map(zones.map((zone) => [zone.id, zone.label]));
    } catch {
      return new Map();
    }
  }
}
