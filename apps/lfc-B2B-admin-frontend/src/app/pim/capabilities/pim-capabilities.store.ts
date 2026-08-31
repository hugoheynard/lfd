import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type { PimCapabilitiesView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Ce que le référentiel **offre sur ce déploiement**.
 *
 * ⚠️ À ne pas confondre avec {@link PermissionsStore} : celui-là dit ce que LA
 * PERSONNE peut faire, celui-ci ce que l'INSTALLATION propose. Les deux se
 * composent — un geste s'offre si la personne y a droit ET si le déploiement
 * l'ouvre — et les confondre ferait chercher une permission manquante là où il
 * n'en manque aucune.
 *
 * **Fermé tant qu'on ne sait pas.** Le défaut est `false`, et il le reste
 * jusqu'à la réponse : offrir un bouton de publication pendant une seconde,
 * puis le retirer, est pire que de l'afficher une seconde plus tard — quelqu'un
 * cliquerait dessus.
 */
@Injectable({ providedIn: 'root' })
export class PimCapabilitiesStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<PimCapabilitiesView | null>(null);

  /** La publication du catalogue est-elle ouverte ici ? */
  readonly publication = computed(() => this.state()?.publication ?? false);

  constructor() {
    if (this.isBrowser) {
      void this.load().catch(() => undefined);
    }
  }

  private async load(): Promise<void> {
    const view = await firstValueFrom(
      this.http.get<PimCapabilitiesView>(`${this.base}/capabilities`),
    );
    this.state.set(view);
  }
}
