import { computed, inject, Injectable, signal } from '@angular/core';
import { NEVER, of, type Observable } from 'rxjs';

import type {
  AuthFacade,
  PendingProfile,
  ProRegistration,
} from '../../../src/app/auth/auth.facade';
import { PREVIEW_WORLD } from '../journeys/preview-world';

/** La surface publique de la vraie façade — ce que les écrans en lisent. */
type AuthFacadeSurface = { readonly [Key in keyof AuthFacade]: AuthFacade[Key] };

/**
 * Le jeton que l'aperçu présente à son propre backend de démonstration. Rien ne
 * le valide, rien ne le reçoit hors de cette application : le backend de
 * démonstration ne sort jamais (cf. `demo-http-backend.ts`).
 */
export const DEMO_ACCESS_TOKEN = 'apercu-sans-identite';

/**
 * **La façade d'authentification de l'aperçu** — mêmes signaux, mêmes
 * méthodes que `AuthFacade`, aucun SDK Auth0 (plan
 * `plan-textes-de-la-boutique.md`, §10 B3).
 *
 * « Connecté » y est un ÉTAT DU PARCOURS, posé avant le premier dessin : aucune
 * session n'existe, aucun jeton n'est fabriqué par un tiers. Les gestes
 * d'entrée et de sortie ne font rien — l'aperçu montre un état, il ne le fait
 * pas évoluer vers une vraie connexion.
 */
@Injectable()
export class DemoAuthFacade implements AuthFacadeSurface {
  private readonly signedIn = inject(PREVIEW_WORLD).account !== null;

  readonly isLoading = signal(false).asReadonly();
  readonly isAuthenticated = signal(this.signedIn).asReadonly();
  readonly signInFailure: AuthFacade['signInFailure'] = signal(null).asReadonly();
  readonly authUser: AuthFacade['authUser'] = signal(null).asReadonly();
  readonly authEmail = computed(() => this.authUser()?.email ?? null);
  readonly pendingProfile = signal<PendingProfile | null>(null);
  readonly pendingProRegistration = signal<ProRegistration | null>(null);
  readonly devSignup: AuthFacade['devSignup'] = signal(null);
  /** L'aperçu n'a pas de session : elle n'expire jamais. */
  readonly sessionExpired = signal(false).asReadonly();

  markSessionExpired(): void {
    // Aucune session à faire expirer.
  }

  renewSession(): void {
    // L'aperçu ne part pas chez Auth0.
  }

  completeDevSignup(): string | null {
    return null;
  }

  authGate$(): Observable<boolean> {
    return of(this.signedIn);
  }

  continueWithEmailCode(): void {
    // L'aperçu ne part pas chez Auth0.
  }

  loginWithPassword(): void {
    // L'aperçu ne part pas chez Auth0.
  }

  registerWithPassword(): void {
    // L'aperçu ne part pas chez Auth0.
  }

  continueWithGoogle(): void {
    // L'aperçu ne part pas chez Google.
  }

  continueWithFacebook(): void {
    // L'aperçu ne part pas chez Facebook.
  }

  registerPro(): void {
    // L'aperçu ne part pas chez Auth0.
  }

  logout(): void {
    // La sortie d'un état de parcours n'existe pas : on change de parcours.
  }

  accessToken$(): Observable<string> {
    return this.signedIn ? of(DEMO_ACCESS_TOKEN) : NEVER;
  }
}
