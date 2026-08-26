import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type { SalesContextView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Le **registre des contextes de vente** — les contextes EN SERVICE, en vue
 * maigre.
 *
 * L'écran ne connaît plus « à emporter / sur place / B2B » : il itère ce que le
 * serveur lui donne. Ajouter un contexte est une ligne en base — pas trois
 * champs dans un panneau, un mapper, une projection et un déploiement de front.
 *
 * Aucune mutation ici : l'écriture passe par `SalesContextAdminStore`, qui lit
 * la liste complète (hors service compris) avec ce qui retient chaque contexte.
 * Deux vues parce que deux besoins — dessiner des colonnes n'exige pas trois
 * `groupBy`.
 */
@Injectable({ providedIn: 'root' })
export class SalesContextStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<SalesContextView[]>([]);
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
      () => firstValueFrom(this.http.get<SalesContextView[]>(`${this.base}/sales-contexts/active`)),
      (items) => this.state.set([...items].sort((a, b) => a.position - b.position)),
    );
  }
}
