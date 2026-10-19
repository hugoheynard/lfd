import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  BundleChoiceCandidateView,
  BundleKeyResponse,
  BundleView,
  CreateBundlePayload,
  EditBundlePresentationPayload,
  SaveBundleCompositionPayload,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les formules** — `/admin/bundles` (`documentation/formules/plan-les-formules.md`,
 * lot F2a), sous `shop_bundles`. Chaque écriture rend la clé ; l'écran relit.
 */
@Injectable({ providedIn: 'root' })
export class BundlesService {
  private readonly http = inject(HttpClient);

  /** Toutes, retirées comprises, la plus récemment écrite d'abord. */
  list(): Promise<readonly BundleView[]> {
    return firstValueFrom(this.http.get<readonly BundleView[]>(this.url()));
  }

  get(key: string): Promise<BundleView> {
    return firstValueFrom(this.http.get<BundleView>(this.url(encodeURIComponent(key))));
  }

  create(payload: CreateBundlePayload): Promise<BundleKeyResponse> {
    return firstValueFrom(this.http.post<BundleKeyResponse>(this.url(), payload));
  }

  editPresentation(
    key: string,
    payload: EditBundlePresentationPayload,
  ): Promise<BundleKeyResponse> {
    return this.put(key, 'presentation', payload);
  }

  /** La composition ENTIÈRE : l'agrégat juge l'état complet, pas un geste. */
  saveComposition(key: string, payload: SaveBundleCompositionPayload): Promise<BundleKeyResponse> {
    return this.put(key, 'composition', payload);
  }

  withdraw(key: string): Promise<BundleKeyResponse> {
    return this.put(key, 'withdraw', {});
  }

  backToDraft(key: string): Promise<BundleKeyResponse> {
    return this.put(key, 'draft', {});
  }

  /** Les articles qu'on peut ajouter (servis au public, hors opérations) — 30 au plus. */
  searchChoices(term: string): Promise<readonly BundleChoiceCandidateView[]> {
    return firstValueFrom(
      this.http.get<readonly BundleChoiceCandidateView[]>(`${B2B_API_BASE}/admin/bundle-choices`, {
        params: { q: term },
      }),
    );
  }

  private put(key: string, section: string, body: unknown): Promise<BundleKeyResponse> {
    return firstValueFrom(
      this.http.put<BundleKeyResponse>(this.url(`${encodeURIComponent(key)}/${section}`), body),
    );
  }

  private url(tail?: string): string {
    const root = `${B2B_API_BASE}/admin/bundles`;
    return tail === undefined ? root : `${root}/${tail}`;
  }
}
