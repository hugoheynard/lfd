import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { Emplacement } from '../data/models';
import { EmplacementHttpApi, type EmplacementInput } from './emplacement-http-api';

/**
 * Source **réactive** unique des emplacements — remplace le signal LocalDb. La
 * liste lit `items()` ; création / édition / suppression et les actions QR
 * passent ici (backend puis relecture), donc la liste se met à jour toute seule.
 */
@Injectable({ providedIn: 'root' })
export class EmplacementStore {
  private readonly api = inject(EmplacementHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Emplacement[]>([]);
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

  async create(input: EmplacementInput): Promise<{ id: string }> {
    const created = await this.api.create(input);
    await this.reload();
    return created;
  }

  async update(id: string, patch: Partial<EmplacementInput>): Promise<void> {
    await this.api.update(id, patch);
    await this.reload();
  }

  async remove(id: string): Promise<void> {
    await this.api.remove(id);
    await this.reload();
  }

  /** (Re)génère le QR d'une table ; le token neuf vient du serveur. */
  async generateTableQr(id: string, tableNumber: number): Promise<void> {
    await this.api.generateTableQr(id, tableNumber);
    await this.reload();
  }

  async removeTableQr(id: string, tableNumber: number): Promise<void> {
    await this.api.removeTableQr(id, tableNumber);
    await this.reload();
  }
}
