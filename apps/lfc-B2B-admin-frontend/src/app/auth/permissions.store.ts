import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { StaffMeView, StaffPermission } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Où en est la lecture de « qui je suis ». */
type LoadState = 'idle' | 'loading' | 'ready' | 'denied';

/**
 * Ce que la personne connectée a le droit de faire — **la seule source** dont
 * l'écran dispose pour décider ce qu'il montre.
 *
 * Elle vient de `GET /admin/me`, et de nulle part ailleurs. C'est la couture de
 * sortie vers un futur backend IAM : le jour où les droits viennent d'ailleurs,
 * on change qui répond à cette question, pas un écran.
 *
 * **Le front cache, le serveur refuse.** Ce magasin ne protège rien : il évite
 * seulement d'offrir des boutons qui rendraient `403`. Le mur est
 * `StaffAccessGuard`, côté backend, et il tranche même si un écran ment.
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
    } catch {
      // Un échec réseau et un refus se ressemblent ici, et la conclusion est la
      // même côté écran : on ne montre rien qu'on ne puisse justifier.
      this.me.set(null);
      this.state.set('denied');
    } finally {
      this.pending = null;
    }
  }
}
