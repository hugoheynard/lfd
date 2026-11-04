import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DayJournal, DayVersionsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

export type { DayJournal } from '@lfd/contracts';

/**
 * La **porte unique** des versions de journée — `GET admin/day-versions`
 * (`documentation/caching-usage/version-par-journee.md`, D8, décision de
 * Hugo du 2026-11-03 : « c'est important pour ne pas dériver »).
 *
 * 🔴 **Le SEUL code du front qui l'appelle** (`lint:day-version-door` le
 * tient) : un écran confie ses journaux au `DayVersionWatcher`, jamais à la
 * porte en direct, sans quoi deux écrans reposeraient deux fois la même
 * question.
 *
 * Quatre journaux (`orders`, `production`, `delivery`, `my-round`), chacun
 * sous SON droit côté serveur : un journal que le poste ne peut pas lire est
 * ABSENT de la réponse, et le veilleur ne le suit tout simplement pas. Le
 * droit ne se choisit plus par la porte : la Supervision et le comptoir lisent
 * le même `orders`, le fournil et la Supervision le même `production`.
 */
const DAY_VERSIONS_PATH = 'admin/day-versions';

/** Lit les versions d'une journée dans plusieurs journaux — une requête, rien d'autre. */
@Injectable({ providedIn: 'root' })
export class DayVersionService {
  private readonly http = inject(HttpClient);

  /**
   * @returns la version de chaque journal demandé ET permis ; un journal
   *   absent n'est pas lisible par ce poste.
   */
  async versions(
    date: string,
    journals: readonly DayJournal[],
  ): Promise<Partial<Record<DayJournal, number>>> {
    const params = new HttpParams().set('date', date).set('journals', journals.join(','));
    const view = await firstValueFrom(
      this.http.get<DayVersionsView>(`${B2B_API_BASE}/${DAY_VERSIONS_PATH}`, { params }),
    );
    return view.versions;
  }
}
