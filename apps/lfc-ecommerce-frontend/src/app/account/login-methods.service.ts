import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { LoginMethodsView } from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { IdentityAuthorization } from '../auth/identity-authorization';
import {
  type LoginMethodRefusal,
  type LoginMethodsOutcome,
  type PasswordLinkOutcome,
  RETRYABLE_REFUSALS,
} from './login-methods';

/** La route, hors de `/me` : voir le JSDoc de `LoginMethodView` (contrats). */
const IDENTITIES = `${AUTH_CONFIG.apiBaseUrl}/me/identities`;

/** Le lien de changement de mot de passe, demandé pour soi-même. */
const PASSWORD_LINK = `${AUTH_CONFIG.apiBaseUrl}/me/password-link`;

/**
 * Les **méthodes de connexion** de la personne : les lire, en ajouter une, en
 * retirer une.
 *
 * Elles ne vivent pas dans `AccountService`, et ce n'est pas un rangement : la
 * liste est tenue par le fournisseur d'identité, donc `GET /me/identities` est
 * un appel réseau sortant que seul le profil déclenche (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, R6).
 * La mettre dans le compte l'aurait posée sur le chemin d'amorçage de toutes
 * les pages.
 *
 * ## Aucun état ici, et c'est voulu
 *
 * Trois appels, trois promesses, et la liste relue en réponse des deux
 * écritures. Un écran unique n'a pas besoin d'un signal partagé — et un cache
 * qui survivrait au dialogue montrerait une liste périmée à la réouverture.
 *
 * ## Les échecs ne se ressemblent pas
 *
 * Un refus du serveur porte son message, écrit pour être lu ; un échec
 * d'autorisation n'en a pas, et l'écran met le sien. Le geste, lui, se branche
 * sur le **code** (`again`), jamais sur la phrase.
 */
@Injectable({ providedIn: 'root' })
export class LoginMethodsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly authorization = inject(IdentityAuthorization);

  /** `GET /me/identities` — ce avec quoi la personne peut se connecter. */
  async list(): Promise<LoginMethodsOutcome> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      return { kind: 'loaded', methods: await this.read(token) };
    } catch (error: unknown) {
      return { kind: 'failed', refusal: refusalFrom(error) };
    }
  }

  /**
   * Ajoute une méthode : autoriser dans une popup, puis `POST /me/identities`.
   *
   * 🔴 **L'ordre des trois premières lignes est le sujet** (plan R5) :
   *
   * 1. la fenêtre s'ouvre **au clic**, vide — un `await` plus tôt et le
   *    navigateur la bloquerait ;
   * 2. le jeton de la session **en cours** se prend AVANT l'autorisation.
   *    Après, un rafraîchissement silencieux repartirait chez Auth0, dont la
   *    session SSO serait devenue celle du compte secondaire, et rendrait le
   *    **mauvais** sujet ;
   * 3. c'est CE jeton qui porte l'appel.
   */
  async add(connection: string): Promise<LoginMethodsOutcome> {
    const popup = this.authorization.openWindow();
    let token: string;
    let proof: string | null;
    try {
      token = await firstValueFrom(this.auth.accessToken$());
      proof = await this.authorization.prove(connection, popup);
    } catch {
      popup?.close();
      // Rien du serveur à citer : l'échec est survenu avant lui.
      return { kind: 'failed', refusal: { again: true, message: null } };
    }
    if (proof === null) {
      return { kind: 'cancelled' };
    }
    try {
      const methods = await firstValueFrom(
        this.http.post<LoginMethodsView>(IDENTITIES, { idToken: proof }, headers(token)),
      );
      return { kind: 'loaded', methods };
    } catch (error: unknown) {
      return { kind: 'failed', refusal: refusalFrom(error) };
    }
  }

  /**
   * `DELETE /me/identities/:provider` — le **nom de connexion**, jamais un
   * identifiant chez le fournisseur : celui-ci s'écrirait dans tous les
   * journaux d'accès (plan §9.5).
   */
  async revoke(provider: string): Promise<LoginMethodsOutcome> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      const methods = await firstValueFrom(
        this.http.delete<LoginMethodsView>(
          `${IDENTITIES}/${encodeURIComponent(provider)}`,
          headers(token),
        ),
      );
      return { kind: 'loaded', methods };
    } catch (error: unknown) {
      return { kind: 'failed', refusal: refusalFrom(error) };
    }
  }

  /**
   * `POST /me/password-link` — **sans corps**, 204 en retour : le serveur
   * envoie le lien à l'adresse de la personne, et ne rend rien qui la
   * concerne.
   *
   * Tous les refus se ressemblent du point de vue de l'écran : il n'y a qu'un
   * geste, et aucun ne se répare en le refaisant tout de suite. Les deux 409
   * (adresse non prouvée, compte sans mot de passe) et le 429 de débit
   * s'affichent donc tels que le serveur les écrit.
   */
  async sendPasswordLink(): Promise<PasswordLinkOutcome> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      await firstValueFrom(this.http.post(PASSWORD_LINK, null, headers(token)));
      return { kind: 'sent' };
    } catch (error: unknown) {
      return { kind: 'failed', message: httpErrorMessage(error) };
    }
  }

  private read(token: string): Promise<LoginMethodsView> {
    return firstValueFrom(this.http.get<LoginMethodsView>(IDENTITIES, headers(token)));
  }
}

/** Le refus du serveur, et le geste qu'il appelle. */
function refusalFrom(error: unknown): LoginMethodRefusal {
  const code = httpErrorCode(error);
  return {
    again: code !== null && RETRYABLE_REFUSALS.includes(code),
    message: httpErrorMessage(error),
  };
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}
