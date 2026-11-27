import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { OfferedOptionGroupView, ShopOptionGroupsView } from '@lfd/contracts';
import { catchError, of, type Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import {
  contextKeyed,
  ContextReadAbandoned,
  type ContextKey,
  workspaceRequestOf,
} from '../context-keyed/context-keyed';
import { ProVisit } from './pro-visit.service';

/** La part de clé d'un visiteur venu de `/pro` — comme le rayon, une autre clientèle. */
const PRO_VISIT_PART = 'pro';

type OptionIndex = ReadonlyMap<string, readonly OfferedOptionGroupView[]>;

const NO_OPTIONS: readonly OfferedOptionGroupView[] = [];

/**
 * **Les options que le client peut choisir sur chaque article** (« dont 2
 * tranchés », `documentation/catalogue/plan-options-de-commande.md`, § 3.3),
 * à la clientèle que le serveur résout — jamais filtrées ici.
 *
 * Une lecture à part du rayon : le rayon est gardé en cache et tiré de
 * l'instantané du catalogue, dont les options ne font pas partie. Rangée sous
 * la même clé que lui (l'espace affiché, la visite pro en part propre), par la
 * brique `context-keyed` : rien n'est montré pour un autre espace.
 *
 * Un échec de lecture ne se dit pas : il n'y a alors rien à choisir, et la
 * ligne part sans option — ce que le panier faisait avant elles. Le serveur
 * reste juge de ce qui est proposé, à la passation.
 */
@Injectable({ providedIn: 'root' })
export class ShopOptionGroups {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);
  private readonly proVisit = inject(ProVisit);

  private readonly keyed = contextKeyed<OptionIndex>((key) => this.load(key));
  /** Avancé à chaque lecture rangée : la brique n'est pas un signal. */
  private readonly stored = signal(0);
  /** Quelqu'un a-t-il demandé les options ? Sans demande, une bascule ne relit rien. */
  private readonly wanted = signal(false);

  private readonly key = computed<ContextKey | null>(
    () => {
      const prefix = this.context.prefix();
      if (prefix === null) {
        return null;
      }
      const own = prefix === VISITOR && this.proVisit.active() ? PRO_VISIT_PART : '';
      return { workspace: prefix, own };
    },
    { equal: (a, b) => idOrNull(a) === idOrNull(b) },
  );

  private readonly shown = computed<OptionIndex | undefined>(() => {
    this.stored();
    const key = this.key();
    return key === null ? undefined : this.keyed.shown(key);
  });

  constructor() {
    effect(() => {
      this.key();
      if (untracked(this.wanted)) {
        untracked(() => {
          void this.hydrate();
        });
      }
    });
  }

  /** Les groupes proposés sur l'article — vide tant que rien n'est lu, ou qu'il n'y en a pas. */
  groupsOf(sku: string): readonly OfferedOptionGroupView[] {
    return this.shown()?.get(sku) ?? NO_OPTIONS;
  }

  /** Va chercher les options de la clé affichée, une fois (idempotent tant qu'elle ne change pas). */
  async hydrate(): Promise<void> {
    this.wanted.set(true);
    const key = this.key();
    if (key === null || this.shown() !== undefined) {
      return;
    }
    try {
      await this.keyed.ensure(key);
      this.stored.update((count) => count + 1);
    } catch (error) {
      if (!(error instanceof ContextReadAbandoned)) {
        throw error;
      }
    }
  }

  private load(key: ContextKey): Observable<OptionIndex> {
    return this.read(key).pipe(
      map((view) => new Map(view.items.map((item) => [item.sku, item.groups] as const))),
      // Rien à choisir plutôt qu'un panier en panne : la ligne part sans option.
      catchError(() => of<OptionIndex>(new Map())),
    );
  }

  /** Comme le rayon : publique (vitrine ou visite pro), ou celle du client reconnu. */
  private read(key: ContextKey): Observable<ShopOptionGroupsView> {
    const url = `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue/options`;
    if (key.workspace === VISITOR) {
      return this.http.get<ShopOptionGroupsView>(url, {
        ...workspaceRequestOf(key),
        ...(key.own === PRO_VISIT_PART ? { params: { audience: 'pro' } } : {}),
      });
    }
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<ShopOptionGroupsView>(
            `${url}/mine`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }
}

function idOrNull(key: ContextKey | null): string | null {
  return key === null ? null : `${key.workspace}\u0000${key.own}`;
}
