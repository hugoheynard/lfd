import { inject, Injectable } from '@angular/core';

import type { AllergenReference, AllergenScope } from '../data/models';
import { ReferenceApi } from './reference-api';

/**
 * **Le référentiel des allergènes, lu une fois par session** — `eu` et
 * `world`, chacun à sa première demande.
 *
 * Un référentiel réglementaire : il ne change qu'avec une migration, jamais
 * par un geste de l'équipe. La fiche produit (à chaque ouverture) et la
 * provenance le relisaient chacune ; elles le lisent ici.
 *
 * La lecture EN COURS est partagée : deux demandes simultanées font une
 * requête. Un échec n'est pas gardé — la demande suivante relit, et c'est ce
 * qui garde vrai le bouton « Réessayer » de la provenance.
 */
@Injectable({ providedIn: 'root' })
export class AllergenReferenceStore {
  private readonly api = inject(ReferenceApi);
  private readonly byScope = new Map<AllergenScope, Promise<AllergenReference>>();

  allergens(scope: AllergenScope): Promise<AllergenReference> {
    const known = this.byScope.get(scope);
    if (known !== undefined) {
      return known;
    }
    const reading = this.api.allergens(scope);
    this.byScope.set(scope, reading);
    reading.catch(() => {
      if (this.byScope.get(scope) === reading) {
        this.byScope.delete(scope);
      }
    });
    return reading;
  }
}
