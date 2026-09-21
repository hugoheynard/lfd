import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DevSeedReport } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Recharger le jeu de données de développement.**
 *
 * Un seul appel, un seul geste. Pas de « juste les commandes » ni de « juste la
 * station » : les trois étapes dépendent l'une de l'autre côté serveur, et
 * offrir de n'en jouer qu'une produirait des états intermédiaires que personne
 * n'a décrits.
 *
 * ⚠️ Ce service n'existe que dans un build de développement — il n'est atteint
 * que par la page du même dossier, elle-même absente du bundle de production
 * (cf. `dev-tools.ts`).
 */
@Injectable({ providedIn: 'root' })
export class DevSeedService {
  private readonly http = inject(HttpClient);

  reload(): Promise<DevSeedReport> {
    return firstValueFrom(
      this.http.post<DevSeedReport>(`${B2B_API_BASE}/admin/dev/seed/reload`, {}),
    );
  }
}
