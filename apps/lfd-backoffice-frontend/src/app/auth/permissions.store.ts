import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { StaffMeView, StaffPermission } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Où en est la lecture de « qui je suis ». */
type LoadState = 'idle' | 'loading' | 'ready' | 'denied' | 'expired' | 'unavailable';

/** Les issues d'échec de la lecture : chacune a son message et son geste de sortie. */
type FailedState = 'denied' | 'expired' | 'unavailable';

/**
 * Classe un échec de `GET /admin/me`.
 *
 * - `401` : la session ne s'est pas renouvelée (jeton expiré, rafraîchissement
 *   révoqué). Quand `getAccessTokenSilently` échoue, `StaffAuth.token()` rend
 *   `null` et la requête part sans en-tête : le serveur répond `401`, donc ce
 *   cas arrive ici aussi.
 * - `403` : `StaffAccessGuard` ne connaît pas cette personne, ou la sait
 *   suspendue (vérifié le 2026-10-27 dans `staff-access.guard.ts` :
 *   `ForbiddenException` ; le `401` est réservé au jeton par `admin-auth.guard.ts`).
 * - le reste (statut `0`, `5xx`, erreur hors HTTP) : le back-office ne répond pas.
 */
function classifyFailure(error: unknown): FailedState {
  if (!(error instanceof HttpErrorResponse)) {
    return 'unavailable';
  }
  if (error.status === 401) {
    return 'expired';
  }
  if (error.status === 403) {
    return 'denied';
  }
  return 'unavailable';
}

/**
 * Ce que la personne connectée a le droit de faire — **la seule source** dont
 * l'écran dispose pour décider ce qu'il montre.
 *
 * Elle vient de `GET /admin/me`, et de nulle part ailleurs. Le jour où le calcul
 * des droits change — les rôles définis en base, par exemple —, on change qui
 * répond à cette question, pas un écran.
 *
 * **Le front cache, le serveur refuse.** Ce magasin ne protège rien : il évite
 * seulement d'offrir des boutons qui rendraient `403`. Le mur est
 * `StaffAccessGuard`, côté backend, et il tranche même si un écran ment.
 *
 * `expired` et `unavailable` ne sont pas « sus » : `ensureLoaded()` relira au
 * prochain appel, et l'écran offre le geste (se reconnecter, réessayer).
 *
 * `denied` n'est pas une erreur de chargement : c'est la réponse d'un backend
 * qui ne nous connaît pas. On la distingue pour pouvoir le dire à l'écran au
 * lieu d'afficher une coquille vide.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsStore {
  private readonly http = inject(HttpClient);

  private readonly state = signal<LoadState>('idle');
  private readonly me = signal<StaffMeView | null>(null);
  /** La lecture en cours, pour que dix gardes de route ne fassent qu'un appel. */
  private pending: Promise<void> | null = null;

  /** L'identité du staff connecté, ou `null` tant qu'on ne l'a pas lue. */
  readonly identity = computed(() => this.me());

  /** Vrai quand on sait — qu'il y ait des droits ou non. */
  readonly loaded = computed(() => this.state() === 'ready' || this.state() === 'denied');

  /** Le backend ne reconnaît pas cette personne (fiche absente ou suspendue). */
  readonly denied = computed(() => this.state() === 'denied');

  /**
   * La session n'a pas pu se renouveler (`401`). Ce n'est PAS « aucun accès » :
   * l'écran le disait jusqu'au 2026-10-27, et alarmait une personne dont les
   * droits n'avaient pas bougé.
   */
  readonly expired = computed(() => this.state() === 'expired');

  /** Le back-office ne répond pas (réseau, `5xx`) — on ne sait rien des droits. */
  readonly unavailable = computed(() => this.state() === 'unavailable');

  /** Les permissions effectives, déjà résolues par le serveur. */
  readonly permissions = computed<readonly StaffPermission[]>(() => this.me()?.permissions ?? []);

  /**
   * A-t-on ce droit ? Faux tant que la lecture n'a pas eu lieu — on n'offre pas
   * une action qu'on n'a pas encore le droit d'offrir.
   */
  can(permission: StaffPermission): boolean {
    // `includes` plutôt que l'aide du contrat : celle-ci est une valeur, donc
    // l'importer ici tirerait zod et TOUS les schémas dans le bundle initial —
    // +280 ko sur le chemin eager, pour un test d'appartenance. Les contrats
    // restent **type-only** côté front ; la règle qui compte (combiner rôle et
    // dérogations) a déjà été appliquée par le serveur.
    return this.permissions().includes(permission);
  }

  /** Charge une fois. Les appels concurrents partagent la même lecture. */
  async ensureLoaded(): Promise<void> {
    if (this.state() === 'ready' || this.state() === 'denied') {
      return;
    }
    this.pending ??= this.load();
    await this.pending;
  }

  /** Relit maintenant — après un changement de rôle, par exemple. */
  async reload(): Promise<void> {
    this.pending = this.load();
    await this.pending;
  }

  private async load(): Promise<void> {
    this.state.set('loading');
    try {
      const me = await firstValueFrom(this.http.get<StaffMeView>(`${B2B_API_BASE}/admin/me`));
      this.me.set(me);
      this.state.set('ready');
    } catch (error: unknown) {
      // Aucun droit n'est retenu, quel que soit l'échec. Mais l'écran doit dire
      // lequel : une session expirée n'est ni un refus ni une panne.
      this.me.set(null);
      this.state.set(classifyFailure(error));
    } finally {
      this.pending = null;
    }
  }
}
