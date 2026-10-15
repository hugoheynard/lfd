import { Injectable, inject, signal } from '@angular/core';
import type { ProPricePrefillPreviewView } from '@lfd/pim-contracts';

import { AccountingRulesHttpApi } from './accounting-rules-http-api';

/**
 * **L'aperçu du pré-remplissage du prix pro** (lot P, P5) — à la demande, et
 * jamais au démarrage : c'est le premier des deux temps du geste, et il lit
 * tout le catalogue.
 */
@Injectable({ providedIn: 'root' })
export class ProPricePrefillStore {
  private readonly api = inject(AccountingRulesHttpApi);

  private readonly state = signal<ProPricePrefillPreviewView | null>(null);
  /** `null` = aucun aperçu demandé. */
  readonly preview = this.state.asReadonly();

  private readonly failure = signal<unknown>(null);
  /** Pourquoi l'aperçu n'a pas pu se lire — `null` = il n'a pas échoué. */
  readonly loadError = this.failure.asReadonly();

  async load(): Promise<void> {
    try {
      this.state.set(await this.api.previewProPricePrefill());
      this.failure.set(null);
    } catch (caught) {
      this.failure.set(caught);
      throw caught;
    }
  }

  /** Écrit, puis adopte l'aperçu relu. Un refus est relancé : l'écran le dit. */
  async apply(): Promise<void> {
    this.state.set(await this.api.applyProPricePrefill());
  }
}
