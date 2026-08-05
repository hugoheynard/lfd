import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { TvaRegime } from '../../data/models';
import { TvaHttpApi, type TvaRegimeInput } from './tva-http-api';

/**
 * Source **réactive** unique des régimes de TVA — remplace le signal LocalDb.
 * Table, panneau et usages plateforme lisent `items()` ; les mutations passent
 * ici (backend puis relecture), donc tout ce qui affiche la liste se recompose.
 */
@Injectable({ providedIn: 'root' })
export class TvaStore {
  private readonly api = inject(TvaHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<TvaRegime[]>([]);
  readonly items = this.state.asReadonly();

  constructor() {
    if (this.isBrowser) {
      // Auto-load best-effort : un backend injoignable laisse la liste vide,
      // il ne doit jamais devenir un rejet de promesse non géré.
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    this.state.set(await this.api.list());
  }

  async create(input: TvaRegimeInput): Promise<{ id: string }> {
    const created = await this.api.create(input);
    await this.reload();
    return created;
  }

  async update(id: string, input: TvaRegimeInput): Promise<void> {
    await this.api.update(id, input);
    await this.reload();
  }

  async remove(id: string): Promise<void> {
    await this.api.remove(id);
    await this.reload();
  }
}
