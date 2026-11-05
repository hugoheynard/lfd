import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
// Types seulement : aucune valeur du baril du contrat n'entre ici, qui
// embarquerait zod dans le bundle initial (1,44 Mo pour un budget de 1,30 Mo,
// mesuré le 2026-09-14).
import type { FeatureLevelsView, GateLevel, VisibilityLevel } from '@lfd/contracts';
// Les VALEURS passent par le sous-chemin sans zod, jamais par le baril.
import { isAtLeast } from '@lfd/contracts/feature-access-levels';
import {
  filter,
  firstValueFrom,
  of,
  switchMap,
  take,
  throwError,
  timeout,
  type Observable,
} from 'rxjs';

import { AccountService } from '../../account/account.service';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/** Où en est la lecture des niveaux. L'échec est une RÉPONSE, pas une attente. */
export type FeatureAccessState = 'loading' | 'ready' | 'failed';

/**
 * Le délai au-delà duquel une lecture sans réponse compte comme un échec.
 *
 * Sans lui, un serveur qui accepte la connexion et ne répond jamais laisserait
 * les gardes suspendues : la navigation ne partirait nulle part, et rien ne le
 * dirait. Huit secondes couvrent un démarrage à froid de l'API — et la
 * résolution de la session Auth0, qui passe avant.
 */
const READ_TIMEOUT_MS = 8_000;

/** Le mandat client tant qu'on ne sait pas : fermé, comme le défaut du catalogue. */
const UNKNOWN_MANDATE_LEVEL: GateLevel = 'closed';

/** Le bouton Facebook tant qu'on ne sait pas : masqué, comme le défaut du catalogue. */
const UNKNOWN_FACEBOOK_LEVEL: VisibilityLevel = 'hidden';

/**
 * **Les niveaux de l'accès aux fonctionnalités**, tels que le serveur les dit.
 *
 * Plan : `documentation/auth-inscription/plan-inscription-pro-seule.md` §4.
 *
 * Il ne reste que le mandat client et la connexion par Facebook depuis le
 * 2026-10-09 : la boutique, « Mes commandes », « Mes factures », le menu au
 * bureau et la livraison aux particuliers ne sont plus des clés (la dernière
 * dépend du réglage admin « Livraison », que le serveur applique).
 *
 * Ce service ne FERME rien : c'est l'API qui refuse. Il évite seulement que
 * l'écran montre une carte dont chaque requête partirait en 409.
 *
 * Les niveaux sont lus UNE fois par chargement de page (`app.config.ts`). Aucun
 * rafraîchissement : un changement fait en admin se voit au prochain
 * chargement, et c'est le serveur qui le tient entre-temps. Une connexion Auth0
 * est un rechargement complet, donc elle relit d'elle-même.
 */
@Injectable({ providedIn: 'root' })
export class ClientFeatureAccess {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /**
   * Le compte n'est résolu que pour une personne reconnue : un visiteur n'a
   * pas de `/me`, et n'a pas à instancier ce qui le lirait.
   */
  private readonly injector = inject(Injector);

  private readonly levels = signal<FeatureLevelsView | null>(null);
  private readonly status = signal<FeatureAccessState>('loading');

  /** Partagée par tous les appelants : la lecture ne part qu'une fois. */
  private pending: Promise<void> | null = null;
  /** Résout la promesse d'attente, que la réponse vienne du réseau ou d'une suite. */
  private settle: () => void = () => undefined;
  private readonly settledPromise = new Promise<void>((resolve) => {
    this.settle = resolve;
  });

  readonly state = this.status.asReadonly();

  /**
   * Le niveau **appliqué** du mandat client (`customerMandate`).
   *
   * `closed` tant qu'on ne sait pas — lecture en vol, échec, ou serveur qui ne
   * connaît pas la clé. C'est le défaut du catalogue, et le sens prudent : la
   * clé est gardée par l'API, une carte montrée à tort n'enverrait que des
   * requêtes refusées en 409.
   */
  readonly customerMandate = computed<GateLevel>(
    () => this.levels()?.customerMandate ?? UNKNOWN_MANDATE_LEVEL,
  );

  /**
   * Vrai si le bouton « Continuer avec Facebook » se montre (`facebookLogin`).
   *
   * Faux tant qu'on ne sait pas — lecture en vol, échec, serveur qui ne connaît
   * pas la clé : un bouton montré sans la connexion activée chez Auth0 mènerait
   * à une erreur, et rien ne le garde côté serveur.
   */
  readonly facebookLoginShown = computed<boolean>(() =>
    isAtLeast('facebookLogin', this.levels()?.facebookLogin ?? UNKNOWN_FACEBOOK_LEVEL, 'visible'),
  );

  /**
   * Vrai si l'encart « être rappelé » de la porte pro se montre
   * (`proSignupCallback`). Faux tant qu'on ne sait pas : masqué est son défaut.
   */
  readonly proSignupCallbackShown = computed<boolean>(() =>
    isAtLeast('proSignupCallback', this.levels()?.proSignupCallback ?? 'hidden', 'visible'),
  );

  /** Résout quand l'état a quitté `loading` — succès ou échec. */
  settled(): Promise<void> {
    return this.settledPromise;
  }

  /** Lance la lecture, une seule fois ; les appels suivants attendent la même. */
  load(): Promise<void> {
    this.pending ??= this.fetch();
    return this.pending;
  }

  /** Pose des niveaux déjà obtenus — les suites s'en servent au lieu de doubler. */
  receive(levels: FeatureLevelsView): void {
    this.pending ??= Promise.resolve();
    this.levels.set(levels);
    this.status.set('ready');
    this.settle();
  }

  private async fetch(): Promise<void> {
    try {
      const levels = await firstValueFrom(this.read().pipe(timeout(READ_TIMEOUT_MS)));
      // Une suite a pu poser ses niveaux pendant le vol : ils font foi.
      if (this.status() === 'loading') {
        this.levels.set(levels);
        this.status.set('ready');
      }
    } catch {
      if (this.status() === 'loading') {
        this.status.set('failed');
      }
    } finally {
      this.settle();
    }
  }

  /**
   * **Le point d'entrée de la lecture**, et le seul.
   *
   * Personne reconnue → ses niveaux à elle, exemption comprise, tels que
   * `GET /me` les porte (`featureLevels`, depuis le 2026-11-05) : le compte
   * se lit de toute façon à l'ouverture, et `GET /feature-access/mine` coûtait
   * une requête entière de plus. Un `/me` en échec est un échec de lecture.
   * Sinon → `GET /feature-access`, les niveaux globaux, sans jeton.
   *
   * On attend `authGate$()` et non `isAuthenticated` : ce signal vaut `false`
   * tant qu'Auth0 résout la session, et un client connecté lirait alors les
   * niveaux globaux au lieu des siens.
   */
  private read(): Observable<FeatureLevelsView> {
    return this.auth.authGate$().pipe(
      take(1),
      switchMap((recognised) =>
        recognised
          ? this.levelsFromAccount()
          : this.http.get<FeatureLevelsView>(`${AUTH_CONFIG.apiBaseUrl}/feature-access`),
      ),
    );
  }

  /** Les niveaux du premier compte chargé ; l'échec de `/me` en est un ici aussi. */
  private levelsFromAccount(): Observable<FeatureLevelsView> {
    const accounts = this.injector.get(AccountService);
    const accountRead$ = toObservable(
      computed(() => ({ account: accounts.account(), status: accounts.status() })),
      { injector: this.injector },
    );
    return accountRead$.pipe(
      filter(({ account, status }) => account !== null || status === 'error'),
      take(1),
      switchMap(({ account }) =>
        account === null
          ? throwError(() => new Error('GET /me a échoué : niveaux inconnus'))
          : of(account.featureLevels),
      ),
    );
  }
}
