import { inject, Injectable } from '@angular/core';

import { StaffAuth } from './staff-auth';

/**
 * D'où vient le **jeton staff** — la question tranchée UNE fois.
 *
 * Elle avait deux réponses : embarquée dans le shell, l'app recevait un jeton
 * relayé par `postMessage` ; en standalone, elle tenait sa propre session Auth0.
 * Le shell est retiré, il ne reste que la seconde — mais l'indirection reste,
 * parce que c'est elle qui empêche treize services de se demander chacun d'où
 * vient le porteur (sept l'avaient oublié).
 *
 * `null` est une réponse valide (hors session, ou dev sans Auth0) : on part alors
 * sans en-tête et c'est le backend qui tranche. Fabriquer un faux jeton, ou faire
 * échouer l'appel avant qu'il ne parte, ne ferait que déplacer le refus.
 */
@Injectable({ providedIn: 'root' })
export class StaffToken {
  private readonly auth = inject(StaffAuth);

  /** Le porteur courant, ou `null` si aucune session ne peut en fournir un. */
  bearer(): Promise<string | null> {
    return this.auth.token();
  }
}
