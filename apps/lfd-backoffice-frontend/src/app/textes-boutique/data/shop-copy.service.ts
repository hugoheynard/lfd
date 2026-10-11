import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ActivityPageView,
  ShopCopyAdminView,
  ShopCopyDraftPayload,
  ShopCopyPublishedView,
  ShopCopyResetPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/shop-copy`;

/**
 * **Les textes de la boutique** — l'écran d'édition, les brouillons, Publier,
 * l'historique (`plan-textes-de-la-boutique.md`, §3 et §10).
 *
 * Murés côté serveur par `@AdminSurface("b2b_storefront")` : lire demande
 * `read`, écrire et publier demandent `write`. Les écritures rendent `204` :
 * l'écran relit.
 */
@Injectable({ providedIn: 'root' })
export class ShopCopyService {
  private readonly http = inject(HttpClient);

  load(): Promise<ShopCopyAdminView> {
    return firstValueFrom(this.http.get<ShopCopyAdminView>(BASE));
  }

  /** Écrit un brouillon sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  async saveDraft(payload: ShopCopyDraftPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${BASE}/drafts`, payload));
  }

  /** « Revenir à l'original », appliqué au prochain Publier. */
  async reset(payload: ShopCopyResetPayload): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${BASE}/resets`, payload));
  }

  publish(): Promise<ShopCopyPublishedView> {
    return firstValueFrom(this.http.post<ShopCopyPublishedView>(`${BASE}/publications`, {}));
  }

  history(page: number, limit: number): Promise<ActivityPageView> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return firstValueFrom(this.http.get<ActivityPageView>(`${BASE}/publications`, { params }));
  }
}
