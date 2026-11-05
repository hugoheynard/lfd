import { computed, inject, Injectable } from '@angular/core';

import { AuthFacade } from '../auth/auth.facade';
import { ClientWorkspace } from './client-workspace.service';

/** Le préfixe d'un lecteur anonyme : les routes publiques, les tarifs des particuliers. */
export const VISITOR = 'visiteur';

/**
 * Le contexte dans lequel la boutique lit ce qui dépend de l'audience.
 *
 * - `inconnu` : la personne est reconnue, mais `/me` n'a pas encore dit son
 *   espace — un lecteur par espace ATTEND ;
 * - `visiteur` : pas de session, les routes publiques ;
 * - `confirmé` : l'espace de la personne reconnue.
 */
export type ClientContextState =
  | { readonly kind: 'inconnu' }
  | { readonly kind: 'visiteur' }
  | { readonly kind: 'confirmé'; readonly workspace: string };

const UNKNOWN: ClientContextState = { kind: 'inconnu' };
const VISITING: ClientContextState = { kind: 'visiteur' };

/**
 * **Le contexte de lecture, en un seul endroit** (lot b du plan
 * `documentation/caching-usage/plan-espace-retenu.md`, §00 bis).
 *
 * Chaque lecteur par audience recopiait la même règle — « visiteur sans
 * session, sinon l'espace, sinon on attend » — et chaque copie était un
 * endroit où l'espace retenu (lot e) devrait être réappris. Ici, la règle
 * s'écrit une fois ; les stores composent leur clé à partir de
 * {@link prefix}, plus ce qui leur est propre (la visite pro, le rayon…).
 *
 * ⚠️ **`confirmé` veut dire aujourd'hui « choisi localement »** :
 * `AccountService.setWorkspace` et `enterProAfterLogin` écrivent l'espace
 * AVANT la réponse du serveur et reviennent en arrière sur échec. Tant que
 * la bascule (lot c) n'a pas son état « en cours », un lecteur peut partir
 * pour un espace que le serveur refusera ensuite — comme avant ce service.
 *
 * Lecture seule, et rien du navigateur : il ne dérive que de signaux, donc
 * le rendu serveur et l'hydratation voient le même état.
 */
@Injectable({ providedIn: 'root' })
export class ClientContext {
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  readonly state = computed<ClientContextState>(
    () => {
      if (!this.auth.isAuthenticated()) {
        return VISITING;
      }
      const workspace = this.workspace.current();
      return workspace === null ? UNKNOWN : { kind: 'confirmé', workspace };
    },
    // Un même espace relu ne doit pas réveiller les lecteurs.
    { equal: (a, b) => prefixOf(a) === prefixOf(b) && a.kind === b.kind },
  );

  /**
   * {@link VISITOR}, l'espace, ou `null` tant qu'il est inconnu : la part de
   * clé que tout lecteur par audience partage.
   */
  readonly prefix = computed<string | null>(() => prefixOf(this.state()));
}

function prefixOf(state: ClientContextState): string | null {
  switch (state.kind) {
    case 'visiteur':
      return VISITOR;
    case 'confirmé':
      return state.workspace;
    case 'inconnu':
      return null;
  }
}
