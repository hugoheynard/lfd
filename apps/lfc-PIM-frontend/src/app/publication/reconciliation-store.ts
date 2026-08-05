import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type {
  ReconciliationBoardView,
  ReconciliationDetailView,
  SnapshotView,
} from '@lfd/pim-contracts';

import { ShopifyApi } from '../channels/shopify-api';

/**
 * Source **réactive** de la réconciliation Shopify — le tableau à trois voies (BASE /
 * OURS / THEIRS) et, à la demande, le détail (diffs) et l'historique (rollback) d'un
 * handle. Le board se recharge après chaque action (push, rollback) pour refléter le
 * nouvel état boutique. Aucun état simulé côté front : tout vient du backend.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationStore {
  private readonly api = inject(ShopifyApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly boardState = signal<ReconciliationBoardView | null>(null);
  readonly board = this.boardState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly detailState = signal<Record<string, ReconciliationDetailView>>({});
  readonly details = this.detailState.asReadonly();

  private readonly historyState = signal<Record<string, SnapshotView[]>>({});
  readonly histories = this.historyState.asReadonly();

  constructor() {
    if (this.isBrowser) {
      void this.reload().catch(() => undefined);
    }
  }

  /** (Re)charge le tableau — interroge la boutique, d'où le `loading`. */
  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.boardState.set(await this.api.reconciliation());
    } catch {
      this.error.set('Backend PIM injoignable — démarrez lfc-PIM-backend (port 3100).');
    } finally {
      this.loading.set(false);
    }
  }

  /** Charge (paresseusement) le détail d'un handle au dépli d'une ligne. */
  async loadDetail(handle: string): Promise<void> {
    const detail = await this.api.reconciliationDetail(handle);
    this.detailState.update((map) => ({ ...map, [handle]: detail }));
  }

  /** Charge l'historique d'un handle (pour le rollback). */
  async loadHistory(handle: string): Promise<void> {
    const history = await this.api.history(handle);
    this.historyState.update((map) => ({ ...map, [handle]: history }));
  }
}
