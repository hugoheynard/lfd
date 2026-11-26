import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { MyFavoritesView } from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import {
  contextKeyed,
  ContextKeyedMemory,
  type ContextKey,
  workspaceRequestOf,
} from '../context-keyed/context-keyed';
import { clearLocal, readLocal, writeLocal } from '../local-store';

/** La clé locale des favoris d'un visiteur (`lfc.favorites` dans le stockage). */
export const GUEST_FAVORITES_KEY = 'favorites';

const NONE: ReadonlySet<string> = new Set();

/** Ce que le stockage rend, validé : une liste de SKU, ou rien. */
function parseSkus(raw: unknown): readonly string[] | null {
  return Array.isArray(raw) ? raw.filter((sku): sku is string => typeof sku === 'string') : null;
}

/** Les écritures en attente ou faites pour un espace, par SKU : posé ou retiré. */
type Overlay = ReadonlyMap<string, ReadonlyMap<string, boolean>>;

/**
 * **Les favoris de la boutique**, gardés par espace
 * (`documentation/commandes/boutique/les-favoris.md`).
 *
 * - Connecté : `GET /me/favorites`, lu par la brique (`contextKeyed`) sous la
 *   clé de l'espace qui s'affiche ; `PUT` / `DELETE /me/favorites/:sku` pour
 *   écrire, l'en-tête d'espace tiré de la même clé.
 * - Visiteur : le stockage local (`lfc.favorites`), rien au serveur.
 * - À la connexion, les SKU du visiteur sont posés dans l'espace courant (un
 *   `PUT` par SKU, idempotent), puis la clé locale est vidée — sauf ceux dont
 *   l'envoi a échoué, gardés pour la prochaine arrivée.
 *
 * Les écritures sont **optimistes** : le cœur bascule au toucher, et revient
 * si l'appel échoue. Ce qui a été écrit se tient dans une surcouche par
 * espace, au-dessus de la dernière lecture ; la déconnexion la vide avec les
 * lectures. Les routes sont `@Idempotent` : aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class ShopFavorites {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  private readonly keyed = contextKeyed((key) => this.read(key));
  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  private readonly overlay = signal<Overlay>(new Map());
  private readonly guest = signal<ReadonlySet<string>>(
    new Set(readLocal(GUEST_FAVORITES_KEY, parseSkus) ?? []),
  );

  /** L'espace qui s'affiche ({@link VISITOR} sans session), ou `null` tant qu'il n'est pas connu. */
  private readonly shownSpace = computed<string | null>(() =>
    this.auth.isAuthenticated() ? this.context.prefix() : VISITOR,
  );

  /** Les SKU en favori dans l'espace qui s'affiche. */
  readonly skus = computed<ReadonlySet<string>>(() => {
    const space = this.shownSpace();
    if (space === null) {
      return NONE;
    }
    if (space === VISITOR) {
      return this.guest();
    }
    this.answered();
    const read = this.keyed.shown(keyOf(space)) ?? [];
    const written = this.overlay().get(space);
    if (written === undefined) {
      return new Set(read);
    }
    const result = new Set(read);
    for (const [sku, on] of written) {
      if (on) {
        result.add(sku);
      } else {
        result.delete(sku);
      }
    }
    return result;
  });

  constructor() {
    const forgetWrites = { clear: () => this.overlay.set(new Map()) };
    inject(ContextKeyedMemory).register(forgetWrites);
    this.context.whenAbandoned((workspace) => this.dropOverlay(workspace));

    // Une lecture par arrivée dans un espace connecté, après y avoir posé ce
    // que le visiteur avait mis de côté.
    effect(() => {
      const space = this.shownSpace();
      if (space === null || space === VISITOR) {
        return;
      }
      untracked(() => void this.arrive(space));
    });
  }

  has(sku: string): boolean {
    return this.skus().has(sku);
  }

  /** Pose ou retire le favori, selon son état affiché. */
  async toggle(sku: string): Promise<void> {
    const space = untracked(() => this.shownSpace());
    if (space === null) {
      return;
    }
    const next = !untracked(() => this.skus()).has(sku);
    if (space === VISITOR) {
      const skus = new Set(untracked(() => this.guest()));
      if (next) {
        skus.add(sku);
      } else {
        skus.delete(sku);
      }
      this.guest.set(skus);
      writeLocal(GUEST_FAVORITES_KEY, [...skus]);
      return;
    }
    const previous = untracked(() => this.overlay())
      .get(space)
      ?.get(sku);
    this.mark(space, sku, next);
    try {
      await this.write(keyOf(space), sku, next);
    } catch {
      this.mark(space, sku, previous);
    }
  }

  private async arrive(space: string): Promise<void> {
    const key = keyOf(space);
    await this.adoptGuest(key);
    try {
      await this.keyed.read(key);
      this.answered.update((count) => count + 1);
    } catch {
      // Une lecture manquée laisse l'onglet absent : un favori n'empêche rien d'acheter.
    }
  }

  /** Pose les SKU du visiteur dans l'espace, puis vide la clé locale de ceux qui sont passés. */
  private async adoptGuest(key: ContextKey): Promise<void> {
    const local = [...untracked(() => this.guest())];
    if (local.length === 0) {
      return;
    }
    const kept: string[] = [];
    for (const sku of local) {
      try {
        await this.write(key, sku, true);
      } catch {
        kept.push(sku);
      }
    }
    this.guest.set(new Set(kept));
    if (kept.length === 0) {
      clearLocal(GUEST_FAVORITES_KEY);
    } else {
      writeLocal(GUEST_FAVORITES_KEY, kept);
    }
  }

  private mark(space: string, sku: string, on: boolean | undefined): void {
    this.overlay.update((overlay) => {
      const next = new Map(overlay);
      const written = new Map(next.get(space) ?? []);
      if (on === undefined) {
        written.delete(sku);
      } else {
        written.set(sku, on);
      }
      next.set(space, written);
      return next;
    });
  }

  private dropOverlay(workspace: string): void {
    this.overlay.update((overlay) => {
      const next = new Map(overlay);
      next.delete(workspace);
      return next;
    });
  }

  private read(key: ContextKey): Observable<readonly string[]> {
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<MyFavoritesView>(
          `${AUTH_CONFIG.apiBaseUrl}/me/favorites`,
          workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
        ),
      ),
      map((view) => view.skus),
    );
  }

  private async write(key: ContextKey, sku: string, on: boolean): Promise<void> {
    const url = `${AUTH_CONFIG.apiBaseUrl}/me/favorites/${encodeURIComponent(sku)}`;
    await firstValueFrom(
      this.auth.accessToken$().pipe(
        switchMap((token) => {
          const options = workspaceRequestOf(key, { Authorization: `Bearer ${token}` });
          return on
            ? this.http.put<void>(url, null, options)
            : this.http.delete<void>(url, options);
        }),
      ),
    );
  }
}

function keyOf(workspace: string): ContextKey {
  return { workspace, own: '' };
}
