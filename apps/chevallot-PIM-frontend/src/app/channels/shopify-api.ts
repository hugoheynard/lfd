import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type SyncStatus = 'never_pushed' | 'up_to_date' | 'drifted' | 'failed';
export type PushOutcome = 'pushed' | 'unchanged' | 'failed';

export interface ShopifySettings {
  shopDomain: string;
  apiVersion: string;
  isEnabled: boolean;
  /** Présence du secret — sa valeur ne quitte jamais le serveur. */
  hasToken: boolean;
  mode: 'live' | 'dry-run';
  updatedAt: string | null;
}

export interface ProductBinding {
  productId: string;
  syncStatus: SyncStatus;
  lastPushedAt: string | null;
  lastError: string | null;
}

export interface PushReport {
  productId: string;
  sku: string;
  outcome: PushOutcome;
  message: string;
}

export interface PushSummary {
  mode: 'live' | 'dry-run';
  results: PushReport[];
}

const BASE_URL = 'http://localhost:3100/channels/shopify';

@Injectable({ providedIn: 'root' })
export class ShopifyApi {
  private readonly http = inject(HttpClient);

  readSettings(): Promise<ShopifySettings> {
    return firstValueFrom(
      this.http.get<ShopifySettings>(`${BASE_URL}/settings`),
    );
  }

  saveSettings(payload: {
    shopDomain: string;
    apiVersion: string;
    isEnabled: boolean;
  }): Promise<ShopifySettings> {
    return firstValueFrom(
      this.http.put<ShopifySettings>(`${BASE_URL}/settings`, payload),
    );
  }

  listBindings(): Promise<ProductBinding[]> {
    return firstValueFrom(this.http.get<ProductBinding[]>(`${BASE_URL}/bindings`));
  }

  push(productIds?: string[]): Promise<PushSummary> {
    return firstValueFrom(
      this.http.post<PushSummary>(
        `${BASE_URL}/push`,
        productIds === undefined ? {} : { productIds },
      ),
    );
  }
}
