import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { VersionSubject, VersionsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

export type { VersionSubject } from '@lfd/contracts';

/**
 * La **porte unique** des versions — `GET admin/versions`
 * (`documentation/caching-usage/plan-veilleur-unique.md`, § 3.3).
 *
 * 🔴 **Le SEUL code du front qui l'appelle** (`lint:day-version-door` le
 * tient) : un écran confie ses sujets au `VersionWatcher`, jamais à la porte
 * en direct, sans quoi deux écrans reposeraient deux fois la même question.
 *
 * Chaque sujet garde SON droit côté serveur : un sujet que le poste ne peut
 * pas lire est ABSENT de la réponse, et le veilleur ne le suit pas.
 */
const VERSIONS_PATH = 'admin/versions';

/** Lit les numéros de plusieurs sujets — une requête, rien d'autre. */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly http = inject(HttpClient);

  /**
   * @param date la journée des sujets journaliers ; `null` si la question
   *   ne porte que des sujets globaux.
   * @returns le numéro de chaque sujet demandé ET permis.
   */
  async versions(
    date: string | null,
    subjects: readonly VersionSubject[],
  ): Promise<Partial<Record<VersionSubject, number>>> {
    let params = new HttpParams();
    if (date !== null) {
      params = params.set('date', date);
    }
    params = params.set('subjects', subjects.join(','));
    const view = await firstValueFrom(
      this.http.get<VersionsView>(`${B2B_API_BASE}/${VERSIONS_PATH}`, { params }),
    );
    return view.versions;
  }
}
