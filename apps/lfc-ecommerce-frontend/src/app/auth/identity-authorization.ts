import { Injectable } from '@angular/core';
import { Auth0Client, InMemoryCache, PopupCancelledError } from '@auth0/auth0-spa-js';

import { appBaseUrl } from './app-base-url';
import { AUTH_CONFIG } from './auth.config';

/**
 * La **seconde** autorisation : prouver, dans une popup, qu'on tient aussi le
 * compte d'un fournisseur — sans rien changer à la session en cours.
 *
 * Elle sert le rattachement depuis le profil (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, R5).
 * Ce qu'elle rend est l'**id_token brut** de ce second compte : la preuve que
 * l'API vérifie elle-même (émetteur, audience, fraîcheur) avant d'absorber
 * l'identité chez Auth0.
 *
 * ## Trois précautions, et aucune n'est décorative
 *
 * 1. 🔴 **Une instance à part, à cache ISOLÉ** (`new InMemoryCache()`). L'échange
 *    de code écrit dans le cache du client qui l'a lancé : mené par l'instance
 *    de l'app, il **remplacerait** la session principale par celle du compte
 *    secondaire. D'où une seconde instance, et jamais `AuthService`.
 * 2. 🔴 **`prompt: 'login'`, toujours** (plan §9.1). Sans lui, Auth0 peut
 *    honorer la session courante et rendre un jeton du compte **principal** :
 *    l'API le refuserait avec un message décrivant le contraire de ce que la
 *    personne vient de faire.
 * 3. **Aucune autorisation concurrente** — la clé de transaction du SDK est
 *    partagée. C'est l'appelant qui verrouille son bouton le temps de
 *    l'aller-retour.
 *
 * ⚠️ **Aucun jeton d'API n'est demandé ici** : pas d'`audience`, donc rien à
 * mettre en cache au-delà de l'id_token qu'on relit aussitôt. L'instance est
 * fabriquée à la première preuve — le SDK touche `window`, et l'app est rendue
 * côté serveur.
 */
/**
 * L'autorisation a réussi, mais le SDK n'a pas d'id_token à rendre.
 *
 * Distincte d'une fermeture de fenêtre (qui rend `null`) : là, il n'y a rien à
 * refaire de la part de la personne, c'est une panne. L'appelant la traite
 * comme tout autre échec d'autorisation.
 */
export class MissingIdentityProofError extends Error {
  constructor() {
    super("L'autorisation n'a rendu aucune preuve d'identité.");
  }
}

@Injectable({ providedIn: 'root' })
export class IdentityAuthorization {
  private instance: Auth0Client | null = null;

  /**
   * Ouvre la fenêtre **au clic**, vide, avant tout `await`.
   *
   * Un navigateur n'accorde `window.open` qu'à un geste de la personne, et le
   * jeton principal se prend AVANT la popup (R5) : laisser le SDK l'ouvrir
   * après cet `await` la ferait bloquer. La fenêtre vide, elle, ne parle à
   * personne — ce que le jeton atteste ne dépend que de l'ordre des appels.
   *
   * `null` (fenêtre refusée) est rendu tel quel : le SDK retombe alors sur sa
   * propre ouverture, et lève s'il échoue aussi.
   */
  openWindow(): Window | null {
    return window.open('', 'lfd-identity-authorization', 'width=480,height=720');
  }

  /**
   * Fait autoriser `connection` dans `popup` et rend l'**id_token brut**.
   *
   * `null` quand la personne a fermé la fenêtre : ce n'est pas un refus, il n'y
   * a rien à lui dire. Tout autre échec lève.
   */
  async prove(connection: string, popup: Window | null): Promise<string | null> {
    const client = this.client();
    try {
      await client.loginWithPopup(
        {
          authorizationParams: {
            connection,
            prompt: 'login',
            redirect_uri: appBaseUrl(),
          },
        },
        { popup },
      );
    } catch (error: unknown) {
      if (error instanceof PopupCancelledError) {
        return null;
      }
      throw error;
    } finally {
      // Le SDK ferme la popup quand la réponse arrive, jamais sur un délai
      // dépassé : sans ça, une fenêtre vide resterait ouverte sur l'écran.
      popup?.close();
    }
    const claims = await client.getIdTokenClaims();
    if (claims === undefined) {
      throw new MissingIdentityProofError();
    }
    return claims.__raw;
  }

  private client(): Auth0Client {
    this.instance ??= new Auth0Client({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      // `.enclosedCache` et non l'objet : `InMemoryCache` est une fabrique, et
      // c'est son champ qui implémente `ICache` (vérifié dans les typings du
      // paquet 2.24.1, `cache/cache-memory.d.ts`, le 2026-09-22).
      cache: new InMemoryCache().enclosedCache,
      authorizationParams: { redirect_uri: appBaseUrl() },
    });
    return this.instance;
  }
}
