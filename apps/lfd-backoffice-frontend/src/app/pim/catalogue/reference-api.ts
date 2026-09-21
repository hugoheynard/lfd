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
 * **Ce client-ci reste en lecture**, et il ne sert que la SAISIE : il omet les
 * entrées archivées et filtre par périmètre réglementaire. Le référentiel, lui,
 * s'administre désormais depuis les réglages produit — écran « Allergènes »,
 * `AllergenHttpApi` sur `/pim/allergens`, qui voit tout, archivés compris.
 *
 * Ce qui reste vrai de la phrase d'origine : **l'officiel est inaltérable.** Les
 * 30 codes GS1 et les 15 catégories semées ne se corrigent pas par formulaire,
 * ils se corrigent à la source, contre GS1. Ce qui est administrable est le
 * référentiel MAISON, et lui seul.
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
