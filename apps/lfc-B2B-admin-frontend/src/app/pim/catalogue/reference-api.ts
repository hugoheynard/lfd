import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { AllergenReference, AllergenScope } from '../data/models';

export type { AllergenEntry, AllergenReference, AllergenScope } from '../data/models';

/**
 * Le **référentiel allergènes**, lu sur le serveur.
 *
 * Il vivait ici en dur, recopié du domaine backend — deux listes réglementées à
 * tenir d'accord, dont une que personne ne pensait à rouvrir. Les codes GS1 et
 * les catégories INCO n'ont qu'une source, `apps/lfd-api/src/pim/allergens/`,
 * et c'est le serveur qui la sert : les mêmes codes valident l'écriture et
 * peuplent le formulaire, sinon on peut cocher ici ce que là-bas refuse.
 *
 * Lecture seule : le référentiel ne se modifie pas par formulaire, il se
 * corrige à la source, contre GS1.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** `eu` = la liste **légale** ; `world` = la liste **interopérable**. */
  async allergens(scope: AllergenScope): Promise<AllergenReference> {
    return firstValueFrom(
      this.http.get<AllergenReference>(`${this.base}/reference/allergens`, {
        params: { scope },
      }),
    );
  }
}
