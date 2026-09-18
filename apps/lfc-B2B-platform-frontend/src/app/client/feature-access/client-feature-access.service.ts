import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  FeatureKey,
  FeatureLevel,
  FeatureLevelsView,
  GateLevel,
  ShopLevel,
  VisibilityFeatureKey,
} from '@lfd/contracts';
// Les imports de valeur du contrat passent par le sous-chemin sans zod. Le prendre
// au baril embarquait zod dans le bundle initial, et le build de déploiement
// dépassait son budget d'erreur (1,44 Mo pour 1,30 Mo, mesuré le 2026-09-14).
import { FEATURE_CATALOGUE, isAtLeast } from '@lfd/contracts/feature-access-levels';
import { firstValueFrom, switchMap, take, timeout, type Observable } from 'rxjs';

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

/**
 * Le niveau qu'on applique tant qu'on ne SAIT pas : pendant la lecture, et
 * après son échec (plan §4).
 *
 * Le sens prudent : un écran qui ne montre pas une commande possible coûte
 * moins qu'un écran qui envoie des requêtes que le serveur refusera en 409.
 */
const UNKNOWN_LEVEL: ShopLevel = 'closed';

/** Le mandat client tant qu'on ne sait pas : fermé, comme le défaut du catalogue. */
const UNKNOWN_MANDATE_LEVEL: GateLevel = 'closed';

/**
 * **Ce que l'app cliente peut faire de la boutique**, tel que le serveur le dit.
 *
 * Plan : `documentation/auth-inscription/plan-inscription-pro-seule.md` §4.
 *
 * Ce service ne FERME rien : c'est l'API qui refuse. Il évite seulement que
 * l'écran promette ce que le serveur refusera — une destination de menu, un
 * bouton de panier, une requête qui partirait en 409. Le code des écrans fermés
 * reste dans le bundle.
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
   * Le niveau de la boutique **appliqué**.
   *
   * `closed` pendant la lecture et après son échec : qui veut distinguer « on ne
   * sait pas » de « c'est fermé » lit {@link state}.
   */
  readonly shop = computed<ShopLevel>(() => this.levels()?.shop ?? UNKNOWN_LEVEL);

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

  /** « Au moins tel niveau » — le seul test qu'un écran écrit, par la règle du contrat. */
  atLeast(required: ShopLevel): boolean {
    return isAtLeast('shop', this.shop(), required);
  }

  /**
   * Le niveau appliqué d'une clé, pour une garde qui la reçoit en paramètre.
   *
   * Tant qu'on ne sait pas — lecture en vol, échec, ou serveur plus ancien qui
   * ne connaît pas la clé :
   *
   * - `shop` vaut `closed`, le sens prudent : l'API refuserait en 409 ;
   * - une surface masquable vaut **son défaut** (`visible`). La masquer ne
   *   protège rien, et une API muette ne doit pas retirer « Mes commandes » du
   *   menu — la commande en cours avec ;
   * - `customerMandate` vaut aussi son défaut, `closed` : voir
   *   {@link customerMandate}.
   */
  levelOf(key: FeatureKey): FeatureLevel {
    return (
      this.levels()?.[key] ?? (key === 'shop' ? UNKNOWN_LEVEL : FEATURE_CATALOGUE[key].defaultLevel)
    );
  }

  /** La surface est-elle montrée ? Vrai tant qu'on ne sait pas : c'est son défaut. */
  visible(key: VisibilityFeatureKey): boolean {
    return this.levelOf(key) === 'visible';
  }

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
   * Personne reconnue → `GET /feature-access/mine`, avec son jeton : ses
   * niveaux à elle, exemption comprise. Sinon → `GET /feature-access`, les
   * niveaux globaux, sans jeton. Branché le 2026-09-14, une fois la route
   * servie (lot 3).
   *
   * On attend `authGate$()` et non `isAuthenticated` : ce signal vaut `false`
   * tant qu'Auth0 résout la session, et un client connecté lirait alors les
   * niveaux globaux — un testeur exempté verrait la boutique fermée.
   */
  private read(): Observable<FeatureLevelsView> {
    const base = AUTH_CONFIG.apiBaseUrl;
    return this.auth.authGate$().pipe(
      take(1),
      switchMap((recognised) =>
        recognised
          ? this.auth.accessToken$().pipe(
              take(1),
              switchMap((token) =>
                this.http.get<FeatureLevelsView>(`${base}/feature-access/mine`, {
                  headers: { Authorization: `Bearer ${token}` },
                }),
              ),
            )
          : this.http.get<FeatureLevelsView>(`${base}/feature-access`),
      ),
    );
  }
}
