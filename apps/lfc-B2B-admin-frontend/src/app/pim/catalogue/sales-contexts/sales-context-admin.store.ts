import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type { SalesContextAdminView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../data/api';
import { ListLoadState } from '../../data/list-load-state';

/**
 * Le registre des contextes de vente, **vu depuis l'administration**.
 *
 * Distinct de `SalesContextStore`, et la différence n'est pas cosmétique :
 * celui-là ne rend que les contextes EN SERVICE, parce qu'il sert à dessiner la
 * matrice de canaux — une colonne qu'on ne peut pas vendre n'y a rien à faire.
 * Celui-ci rend tout, hors service compris : sinon un contexte désactivé
 * disparaîtrait de l'écran qui sert justement à le regarder.
 *
 * En lecture seule, comme son cousin : un contexte se pose par migration.
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
      () =>
        firstValueFrom(
          this.http.get<SalesContextAdminView[]>(`${this.base}/catalogue/sales-contexts`),
        ),
      (items) => this.state.set([...items].sort((a, b) => a.position - b.position)),
    );
  }
}
