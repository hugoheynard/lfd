import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Category, SalesChannels } from '../data/models';
import { CategoryHttpApi } from './category-http-api';

/**
 * Source **réactive** unique des familles — remplace le signal LocalDb. Les
 * lecteurs (pages, collections, publication) lisent `items()` ; toute mutation
 * passe par ce store, qui écrit au backend puis relit, si bien que la liste se
 * met à jour partout. En SSR (démo statique sans backend) on ne fetch pas.
 */
@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly api = inject(CategoryHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Category[]>([]);
  /** Lecture réactive de la liste courante. */
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

  async create(payload: {
    nameFr: string;
    parentId?: string | undefined;
  }): Promise<{ id: string }> {
    const created = await this.api.create(payload);
    await this.reload();
    return created;
  }

  async rename(id: string, nameFr: string): Promise<void> {
    await this.api.rename(id, nameFr);
    await this.reload();
  }

  async archive(id: string): Promise<void> {
    await this.api.archive(id);
    await this.reload();
  }

  async setChannels(id: string, channels: SalesChannels): Promise<void> {
    await this.api.setChannels(id, channels);
    await this.reload();
  }

  async setTva(id: string, emporterTvaId: string, surPlaceTvaId: string): Promise<void> {
    await this.api.setTva(id, emporterTvaId, surPlaceTvaId);
    await this.reload();
  }
}
