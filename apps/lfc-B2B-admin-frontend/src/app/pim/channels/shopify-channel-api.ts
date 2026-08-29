import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Les formes viennent de `@lfd/pim-contracts` — elles y ont été promues depuis
 * les services backend, où elles vivaient en double avec ce fichier.
 *
 * Au passage, le contrat portait `dry_run` pour le mode : la valeur de la BASE
 * (l'enum Postgres, où le tiret est interdit), là où l'API et cet écran
 * échangent `dry-run` depuis toujours. Le contrat décrivait le stockage en se
 * présentant comme le fil, et rien ne l'importait — donc rien ne le disait.
 */
export type {
  ChannelMode,
  ShopifySettingsView as ShopifySettings,
  VerifyResult,
  CatalogueInspection,
  InspectResult,
  PushResult,
  ShopifyCollection,
  DesiredCollection,
  ReconcileRow,
  Reconciliation,
  ShopifyVariantSnapshot,
  ShopifyProductSnapshot,
} from '@lfd/pim-contracts';

import type {
  CatalogueInspection,
  InspectResult,
  PushResult,
  ShopifySettingsView,
  VerifyResult,
} from '@lfd/pim-contracts';

@Injectable({ providedIn: 'root' })
export class ShopifyChannelApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getSettings(): Promise<ShopifySettingsView> {
    return firstValueFrom(this.http.get<ShopifySettingsView>(this.url('settings')));
  }

  saveSettings(input: {
    shopDomain: string;
    apiVersion: string;
    isEnabled: boolean;
  }): Promise<ShopifySettingsView> {
    return firstValueFrom(this.http.put<ShopifySettingsView>(this.url('settings'), input));
  }

  verify(): Promise<VerifyResult> {
    return firstValueFrom(this.http.post<VerifyResult>(this.url('settings/verify'), {}));
  }

  /** L'état actuel du catalogue de la boutique — lecture seule. */
  inspectCatalogue(): Promise<CatalogueInspection> {
    return firstValueFrom(this.http.get<CatalogueInspection>(this.url('products/inspection')));
  }

  /**
   * Les deux routes n'envoient **rien** : le serveur dérive les collections
   * voulues du référentiel des taux. Le front postait sa propre liste, ce qui
   * faisait décider le titre d'une collection Shopify par un composant Angular —
   * et interdisait à la publication de créer ce qui manque sans écran ouvert.
   */
  inspectVatCollections(): Promise<InspectResult> {
    return firstValueFrom(this.http.post<InspectResult>(this.url('collections/vat/inspect'), {}));
  }

  pushVatCollections(): Promise<PushResult> {
    return firstValueFrom(this.http.post<PushResult>(this.url('collections/vat/push'), {}));
  }

  private url(path: string): string {
    return `${this.base}/channels/shopify/${path}`;
  }
}
