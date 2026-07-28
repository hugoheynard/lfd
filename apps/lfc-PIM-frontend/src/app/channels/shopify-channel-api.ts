import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { ShopifySettings } from '../data/models';

export type ChannelMode = 'live' | 'dry-run';

/** Résultat d'une vérification de connexion — un état, pas une exception. */
export interface VerifyResult {
  readonly mode: ChannelMode;
  readonly connected: boolean;
  readonly shopName: string | null;
  readonly detail: string;
}

export interface ShopifyCollection {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly productCount: number;
}

/** Ce que le front veut voir exister côté boutique (handle + titre). */
export interface DesiredCollection {
  readonly handle: string;
  readonly title: string;
}

export interface ReconcileRow {
  readonly handle: string;
  readonly title: string;
  readonly present: boolean;
  readonly remote: ShopifyCollection | null;
}

export interface Reconciliation {
  readonly rows: readonly ReconcileRow[];
  readonly orphans: readonly ShopifyCollection[];
  readonly missingCount: number;
}

export interface InspectResult {
  readonly mode: ChannelMode;
  readonly reconciliation: Reconciliation;
}

export interface PushResult {
  readonly mode: ChannelMode;
  readonly created: readonly ShopifyCollection[];
  readonly reconciliation: Reconciliation;
}

/**
 * Canal Shopify **réel** — parle au backend (`channels/shopify`). Première couche
 * réseau du front : le catalogue reste sur LocalDb, mais la connexion et la
 * réconciliation des collections de TVA sont vraies et vivent côté serveur. Le
 * push produit simulé reste, lui, dans {@link ShopifyApi} (POC).
 */
@Injectable({ providedIn: 'root' })
export class ShopifyChannelApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getSettings(): Promise<ShopifySettings> {
    return firstValueFrom(this.http.get<ShopifySettings>(this.url('settings')));
  }

  saveSettings(input: {
    shopDomain: string;
    apiVersion: string;
    isEnabled: boolean;
  }): Promise<ShopifySettings> {
    return firstValueFrom(this.http.put<ShopifySettings>(this.url('settings'), input));
  }

  verify(): Promise<VerifyResult> {
    return firstValueFrom(this.http.post<VerifyResult>(this.url('settings/verify'), {}));
  }

  inspectTvaCollections(desired: readonly DesiredCollection[]): Promise<InspectResult> {
    return firstValueFrom(
      this.http.post<InspectResult>(this.url('collections/tva/inspect'), {
        desired,
      }),
    );
  }

  pushTvaCollections(desired: readonly DesiredCollection[]): Promise<PushResult> {
    return firstValueFrom(
      this.http.post<PushResult>(this.url('collections/tva/push'), { desired }),
    );
  }

  private url(path: string): string {
    return `${this.base}/channels/shopify/${path}`;
  }
}
