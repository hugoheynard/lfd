import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom } from "rxjs";
import { AuthService } from "@auth0/auth0-angular";

import { SUITE_AUTH_CONFIG, type SuiteAudience } from "./auth.config";
import { DEV_BYPASS_AUTH } from "./dev-flags";

/** Jeton factice rendu en bypass de dev (aucun backend réel n'est appelé). */
const DEV_TOKEN = "dev-token";

/**
 * Lit la claim `permissions` d'un access token JWT — **sans** vérifier la
 * signature (lecture cliente d'un jeton que le SDK a déjà obtenu ; l'enforcement
 * reste serveur). Décode le payload base64url en UTF-8. Tout format inattendu ⇒
 * `[]` (aucun entitlement, donc aucune tuile — fail-closed côté UX).
 */
function readPermissions(jwt: string): readonly string[] {
  const payloadPart = jwt.split(".")[1];
  if (payloadPart === undefined) {
    return [];
  }
  try {
    const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bytes = Uint8Array.from(atob(b64 + pad), (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const perms = (payload as { permissions?: unknown }).permissions;
    return Array.isArray(perms) ? perms.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Façade d'auth du shell — **seul propriétaire** de l'`AuthService` Auth0.
 *
 * C'est délibéré : l'`AuthService` d'Auth0 est `providedIn: 'root'` ET enregistre
 * son propre `APP_INITIALIZER`, donc l'injecter depuis DEUX endroits crée un
 * cycle d'injection (NG0200). En le concentrant ici (singleton unique), tout le
 * reste — le gate du template, le bridge (relais de token) — consomme CETTE
 * façade en injection normale, sans lazy ni service-locator.
 *
 * En bypass de dev, Auth0 n'est pas fourni (`inject(..., optional)` = null) :
 * authentifié d'office, jeton factice.
 */
@Injectable({ providedIn: "root" })
export class AuthFacade {
  private readonly auth = inject(AuthService, { optional: true });

  private readonly loading = this.auth
    ? toSignal(this.auth.isLoading$, { initialValue: true })
    : signal(false);
  private readonly authed = this.auth
    ? toSignal(this.auth.isAuthenticated$, { initialValue: false })
    : signal(true);

  readonly isLoading = computed(() => (DEV_BYPASS_AUTH ? false : this.loading()));
  readonly isAuthenticated = computed(() => (DEV_BYPASS_AUTH ? true : this.authed()));

  /**
   * Entitlements du staff = claim `permissions` du jeton `api-suite` (`app:pim`,
   * `app:b2b-admin`, `suite:settings`). Le launcher s'en sert pour ne montrer que
   * les tuiles autorisées. UX seule : le mur reste chaque backend enfant.
   */
  private readonly perms = signal<readonly string[]>([]);
  private readonly permsLoaded = signal(false);
  private permsRequested = false;

  /** Vrai quand les entitlements sont résolus (ou d'office en bypass). */
  readonly permissionsLoaded = computed(() => DEV_BYPASS_AUTH || this.permsLoaded());

  constructor() {
    // Charge les entitlements dès que la session est authentifiée (une fois). En
    // bypass, rien à charger : `hasPermission` accorde tout.
    if (!DEV_BYPASS_AUTH && this.auth) {
      effect(() => {
        if (this.authed() && !this.permsRequested) {
          this.permsRequested = true;
          void this.loadPermissions();
        }
      });
    }
  }

  /** Vrai si le staff a l'entitlement `permission` (tout accordé en bypass). */
  hasPermission(permission: string): boolean {
    return DEV_BYPASS_AUTH || this.perms().includes(permission);
  }

  private async loadPermissions(): Promise<void> {
    try {
      this.perms.set(readPermissions(await this.getToken("self")));
    } catch {
      this.perms.set([]);
    } finally {
      this.permsLoaded.set(true);
    }
  }

  login(): void {
    if (DEV_BYPASS_AUTH) {
      return;
    }
    void this.auth?.loginWithRedirect();
  }

  logout(): void {
    if (DEV_BYPASS_AUTH) {
      return;
    }
    this.auth?.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  /**
   * Access token pour le backend `audience` (relayé aux apps embarquées par le
   * bridge). Auth0 met en cache par audience. Jeton factice en bypass.
   */
  getToken(audience: SuiteAudience): Promise<string> {
    if (DEV_BYPASS_AUTH || !this.auth) {
      return Promise.resolve(DEV_TOKEN);
    }
    return firstValueFrom(
      this.auth.getAccessTokenSilently({
        authorizationParams: { audience: SUITE_AUTH_CONFIG.audiences[audience] },
      }),
    );
  }
}
