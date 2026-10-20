import { Injectable, signal } from '@angular/core';

/**
 * **« On vient de se connecter »** — vrai au retour d'Auth0 (ou à l'entrée
 * simulée en dev), jusqu'à ce que le compte l'ait lu une fois.
 *
 * Un simple rechargement de page ne le lève pas : seul le retour d'une
 * connexion le fait. `AccountService` s'en sert pour faire entrer dans un
 * espace pro qui a un compte pro (la commerciale, 2026-10-20).
 *
 * Un service à part plutôt qu'un signal de `AuthFacade` : la façade est
 * doublée dans une cinquantaine de specs, et ce fait n'a rien d'Auth0 — il
 * dit seulement QUAND on est entré.
 */
@Injectable({ providedIn: 'root' })
export class LoginMoment {
  readonly fresh = signal(false);
}
