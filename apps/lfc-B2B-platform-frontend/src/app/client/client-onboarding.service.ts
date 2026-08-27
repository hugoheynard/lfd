import { effect, inject, Injectable, signal } from '@angular/core';

import { AccountService } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';

/**
 * Le raccord entre les trois champs de `/bienvenue` et le compte réel.
 *
 * Auth0 ne collecte ni prénom ni téléphone : ils sont saisis chez nous, portés
 * par l'`appState` pendant que la personne pose sa passkey, et reposés au retour
 * par `PATCH /me/profile`. L'utilisateur local, lui, naît tout seul au premier
 * appel authentifié — le backend le provisionne au vol.
 *
 * Le profil n'est reposé QU'UNE FOIS. Sans ce garde-fou, chaque rechargement de
 * page qui rejoue l'`appState` réécrirait le profil par-dessus ce que la
 * personne aurait pu corriger depuis.
 */
@Injectable({ providedIn: 'root' })
export class ClientOnboarding {
  private readonly auth = inject(AuthFacade);
  private readonly account = inject(AccountService);

  private readonly applied = signal(false);

  constructor() {
    effect(() => {
      const profile = this.auth.pendingProfile();
      if (profile === null || this.applied() || !this.auth.isAuthenticated()) {
        return;
      }
      this.applied.set(true);
      this.auth.pendingProfile.set(null);
      this.account.saveProfile({
        firstName: profile.firstName,
        lastName: '',
        email: profile.email,
        phone: profile.phone,
      });
    });
  }
}
