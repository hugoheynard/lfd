import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreatedIdResponse,
  PickupAddressView,
  PromotionListView,
  PromotionsSourceView,
  PromotionTermsPayload,
  PromotionView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les promotions** — `/admin/promotions` (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lots L7-L8). Lecture sous `b2b_pricing` OU `lfc_site_settings`.
 *
 * L'écriture passe par la SURFACE de la promotion : une promotion « retrait
 * à un point » s'écrit sous la fiche du site (`/admin/sites/:id/promotions`,
 * `lfc_site_settings`), les autres sous `/admin/promotions` (`b2b_pricing`).
 * Depuis L12, la source ne vaut plus que `promotions` : le serveur écrit toujours.
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

  /** La source seule : les anciens éditeurs s'en disent en lecture seule. */
  source(): Promise<PromotionsSourceView> {
    return firstValueFrom(this.http.get<PromotionsSourceView>(`${this.base}/source`));
  }

  async pose(terms: PromotionTermsPayload): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(this.surface(terms.fulfillment), terms),
    );
    return created.id;
  }

  revise(id: string, terms: PromotionTermsPayload, reason: string | null): Promise<void> {
    return this.write(`${this.surface(terms.fulfillment)}/${encodeURIComponent(id)}`, 'put', {
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
    const path = `${this.surface(view.fulfillment)}/${encodeURIComponent(view.id)}/${verb}`;
    return this.write(path, 'post', body);
  }

  private async write(path: string, method: 'post' | 'put', body: object): Promise<void> {
    await firstValueFrom(this.http.request<void>(method, path, { body }));
  }

  /** La route de la promotion : celle de son point, ou celle de l'écran. */
  private surface(fulfillment: PromotionView['fulfillment']): string {
    return fulfillment.kind === 'pickup_point' && fulfillment.pickupId !== null
      ? `${B2B_API_BASE}/admin/sites/${encodeURIComponent(fulfillment.pickupId)}/promotions`
      : this.base;
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
