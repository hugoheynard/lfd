import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

import type { AllergenReference, AllergenScope } from '../data/models';
import { watchPim } from '../data/watch-pim';
import { ReferenceApi } from './reference-api';

/**
 * **Le référentiel des allergènes, gardé tant que le numéro `pim` ne bouge
 * pas** — `eu` et `world`, chacun à sa première demande.
 *
 * L'écran des allergènes l'administre : un collègue peut le changer en cours
 * de séance. Quand le numéro `pim` bouge, la copie est oubliée et la demande
 * suivante relit (servie par l'objet partagé si rien d'autre n'a changé).
 * La fiche produit et la provenance le lisent ici.
 *
 * La lecture EN COURS est partagée : deux demandes simultanées font une
 * requête. Un échec n'est pas gardé — la demande suivante relit, et c'est ce
 * qui garde vrai le bouton « Réessayer » de la provenance.
 */
@Injectable({ providedIn: 'root' })
export class AllergenReferenceStore {
  private readonly api = inject(ReferenceApi);
  private readonly byScope = new Map<AllergenScope, Promise<AllergenReference>>();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      watchPim('pim_catalog:read', () => {
        this.forget();
        return Promise.resolve();
      });
    }
  }

  /** Oublie la copie : la demande suivante relit. */
  forget(): void {
    this.byScope.clear();
  }

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
