import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DevSeedReport } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Recharger tout le jeu de données de développement.**
 *
 * Le scénario de commandes seul ne passe plus par ici depuis le 2026-10-05 :
 * il se joue étape par étape (`DevScenarioService`).
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
