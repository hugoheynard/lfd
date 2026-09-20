import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type {
  CreateSalesContextPayload,
  SalesContextAdminView,
  UpdateSalesContextPayload,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Le registre des contextes de vente, **vu depuis l'administration**.
 *
 * Distinct de `SalesContextStore`, et la différence n'est pas cosmétique :
 * celui-là ne rend que les contextes EN SERVICE, parce qu'il sert à dessiner la
 * matrice de canaux — une colonne qu'on ne peut pas vendre n'y a rien à faire.
 * Celui-ci rend tout, hors service compris : sinon un contexte désactivé
 * disparaîtrait de l'écran qui sert justement à le regarder.
 *
 * Il ÉCRIT aussi, depuis que le registre est réglable — mais seul l'admin passe :
 * le serveur exige `catalog:write` sur tout ce qui n'est pas un `GET`. Le front
 * cache les gestes, le serveur les refuse ; le second protège, le premier évite
 * d'offrir un bouton qui répondrait 403.
 */
@Injectable({ providedIn: 'root' })
export class SalesContextAdminStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<SalesContextAdminView[]>([]);
  readonly items = this.state.asReadonly();
  private readonly load = new ListLoadState();
  /** Pourquoi la liste est vide — `null` = elle l'est vraiment. */
  readonly loadError = this.load.error;

  constructor() {
    if (this.isBrowser) {
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    await this.load.run(
      () => firstValueFrom(this.http.get<SalesContextAdminView[]>(this.url(''))),
      (items) => this.state.set([...items].sort((a, b) => a.position - b.position)),
    );
  }

  async create(payload: CreateSalesContextPayload): Promise<void> {
    await firstValueFrom(this.http.post(this.url(''), payload));
    await this.reload();
  }

  async update(key: string, payload: UpdateSalesContextPayload): Promise<void> {
    await firstValueFrom(this.http.put(this.url(key), payload));
    await this.reload();
  }

  async remove(key: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(key)));
    await this.reload();
  }

  private url(path: string): string {
    const base = `${this.base}/sales-contexts`;
    return path === '' ? base : `${base}/${path}`;
  }
}
