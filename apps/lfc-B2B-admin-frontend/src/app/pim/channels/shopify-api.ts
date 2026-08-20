import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ProductBindingView,
  PushReport,
  PushSummary,
  ReconciliationBoardView,
  ReconciliationDetailView,
  SnapshotView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

export type {
  ProductBindingView as ProductBinding,
  PushOutcome,
  PushReport,
  PushSummary,
  SyncStatus,
  ReconciliationStatus,
  ReconciliationRowView,
  ReconciliationBoardView,
  ReconciliationDetailView,
  ComparableView,
  FieldDiffView,
  SnapshotView,
} from '@lfd/pim-contracts';
export type { ShopifySettings } from '../data/models';

/**
 * Shopify **produit** — parle au backend (`channels/shopify/products`). L'état de
 * synchro (bindings) et le push (projection → empreinte → binding) vivent côté
 * serveur : le push est réel en mode `live`, simulé en `dry-run` (le backend
 * choisit d'après les réglages de connexion). Le front ne simule plus rien.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  listBindings(): Promise<ProductBindingView[]> {
    return firstValueFrom(this.http.get<ProductBindingView[]>(this.url('bindings')));
  }

  /** Pousse (ou pré-pousse en `dryRun` : aperçu sans effet de bord). */
  push(productIds?: string[], dryRun = false): Promise<PushSummary> {
    const body = {
      ...(productIds === undefined ? {} : { productIds }),
      ...(dryRun ? { dryRun: true } : {}),
    };
    return firstValueFrom(this.http.post<PushSummary>(this.url('push'), body));
  }

  /** Le tableau de réconciliation à trois voies (par handle). */
  reconciliation(): Promise<ReconciliationBoardView> {
    return firstValueFrom(this.http.get<ReconciliationBoardView>(this.url('reconciliation')));
  }

  /** Détail d'un handle : les trois états + les diffs par paire. */
  reconciliationDetail(handle: string): Promise<ReconciliationDetailView> {
    return firstValueFrom(
      this.http.get<ReconciliationDetailView>(
        this.url(`reconciliation/${encodeURIComponent(handle)}`),
      ),
    );
  }

  /** L'historique versionné d'un handle. */
  history(handle: string): Promise<SnapshotView[]> {
    return firstValueFrom(
      this.http.get<SnapshotView[]>(this.url(`history/${encodeURIComponent(handle)}`)),
    );
  }

  /** Rejoue une version antérieure (crée une nouvelle version). */
  rollback(handle: string, version: number): Promise<PushReport> {
    return firstValueFrom(this.http.post<PushReport>(this.url('rollback'), { handle, version }));
  }

  private url(path: string): string {
    return `${this.base}/channels/shopify/products/${path}`;
  }
}
