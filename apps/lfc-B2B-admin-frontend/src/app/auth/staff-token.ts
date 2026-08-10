import { inject, Injectable } from '@angular/core';

import { SuiteEmbed } from '../suite-embed/suite-embed';
import { StaffAuth } from './staff-auth';

/**
 * Clé d'audience réclamée au shell.
 *
 * `b2bAdmin`, pas `b2b` : le backend B2B est un seul service mais expose **deux
 * surfaces**, et Auth0 leur donne deux APIs distinctes. Demander `b2b`
 * rapporterait un jeton d'audience *client*, que `/admin/*` refuse — et qu'il
 * ne devrait jamais accepter, sans quoi tout client de la boutique entrerait
 * dans le back-office.
 *
 * Une clé hors du jeu connu du shell (`self`, `b2b`, `b2bAdmin`, `pim`) est
 * rejetée par le bridge, qui rend alors `token: null` — **silencieusement**.
 * C'est exactement ce qui se passait avec l'ancienne valeur `'b2b-admin'`.
 */
const SUITE_AUDIENCE = 'b2bAdmin';

/**
 * D'où vient le **jeton staff** — la question tranchée UNE fois.
 *
 * L'app a deux vies et deux sources : embarquée, le shell relaie le jeton par
 * `postMessage` ; en standalone, elle tient sa propre session Auth0. Rien
 * d'autre dans l'app n'a à savoir laquelle des deux tourne.
 *
 * `null` est une réponse valide (hors session, ou dev sans Auth0) : on part alors
 * sans en-tête et c'est le backend qui tranche. Fabriquer un faux jeton, ou faire
 * échouer l'appel avant qu'il ne parte, ne ferait que déplacer le refus.
 */
@Injectable({ providedIn: 'root' })
export class StaffToken {
  private readonly embed = inject(SuiteEmbed);
  private readonly auth = inject(StaffAuth);

  /** Le porteur courant, ou `null` si aucune session ne peut en fournir un. */
  bearer(): Promise<string | null> {
    return this.embed.hosted ? this.embed.requestToken(SUITE_AUDIENCE) : this.auth.token();
  }
}
