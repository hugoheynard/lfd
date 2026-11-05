import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { PublicStorefrontPageView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { firstValueFrom, type Observable, switchMap, timeout } from 'rxjs';

import { AUTH_CONFIG } from '../../../auth/auth.config';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientContext, VISITOR } from '../../client-context.service';
import { ShopAllergenDisplay } from './allergen-display.service';

/**
 * Où en est la page d'un rayon. `failed` n'est PAS un écran : la grille rend
 * alors le rayon comme avant la vitrine, en cartes — jamais un vide.
 */
export type StorefrontPageState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: PublicStorefrontPageView }
  | { readonly status: 'failed' };

/**
 * Au-delà, la vitrine est tenue pour absente et le rayon reste en cartes.
 * C'est surtout la borne du RENDU SERVEUR, qui attend les requêtes en cours
 * avant de répondre : une vitrine muette ne doit pas retenir la boutique.
 */
const PAGE_TIMEOUT_MS = 4000;

/**
 * **La page de vitrine de chaque rayon**, lue une fois par rayon ET par
 * lecteur (`boutique-rayon-layout.md`, lot 4). « Tout » est la clé `all`
 * ({@link ALL_SHELVES}).
 *
 * Comme le catalogue ({@link ShopCatalogue}), elle n'est pas rafraîchie pendant
 * la visite : une grille qui se recomposerait sous le pouce déplacerait ce
 * qu'on s'apprête à toucher.
 *
 * 🔴 **Elle dépend du lecteur**, comme lui, depuis les opérations datées (D11
 * de `architecture-operations-datees.md`, 2026-09-24). Ce commentaire disait
 * le contraire — « la vitrine est la même pour tous » —, vrai tant qu'aucune
 * annonce ne visait une clientèle : une annonce de Noël réservée aux pros est
 * omise pour le public. Le critère est celui du catalogue : un visiteur lit
 * `GET /shop/storefront/:shelfKey`, une personne reconnue
 * `GET /shop/storefront/:shelfKey/mine` pour son espace (en-tête posé par
 * `workspaceInterceptor`), et attend tant que cet espace n'est pas connu.
 *
 * Un échec (réseau, 5xx, délai dépassé) est retenu : réessayer à chaque
 * changement de rayon ferait clignoter la grille. La page suivante du même
 * rayon attendra la prochaine visite.
 */
@Injectable({ providedIn: 'root' })
export class ShopStorefront {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);
  private readonly allergenDisplay = inject(ShopAllergenDisplay);
  private readonly pages = signal<ReadonlyMap<string, StorefrontPageState>>(new Map());

  /**
   * Pour qui la vitrine se lit : {@link VISITOR}, l'espace de la personne
   * reconnue, ou `null` tant que cet espace n'est pas connu. Un écran qui
   * charge la page le suit, pour relire quand il change.
   */
  readonly reader = computed<string | null>(() => this.context.prefix());

  /** Les rayons déjà demandés : ceux qu'une bascule lit d'avance. */
  private readonly shelves = new Set<string>();

  constructor() {
    // Une bascule commence : les rayons déjà ouverts se lisent pour l'espace
    // demandé, sans s'afficher.
    effect(() => {
      const ahead = this.context.ahead();
      if (ahead === null) {
        return;
      }
      untracked(() => {
        for (const shelfKey of this.shelves) {
          void this.loadFor(ahead, shelfKey);
        }
      });
    });
    this.context.whenAbandoned((workspace) => {
      this.forget(workspace);
    });
  }

  /** L'état de la page d'un rayon pour le lecteur du moment ; `null` tant que personne ne l'a demandée. */
  stateOf(shelfKey: string): StorefrontPageState | null {
    const reader = this.reader();
    if (reader === null) {
      return { status: 'loading' };
    }
    return this.pages().get(keyOf(reader, shelfKey)) ?? null;
  }

  /**
   * Demande la page d'un rayon pour le lecteur du moment. Idempotent : une
   * page chargée ou en cours ne se redemande pas ; rien ne part tant que
   * l'espace d'une personne reconnue n'est pas connu.
   *
   * Pendant une bascule, la page de l'espace demandé part AUSSI, rangée sous
   * sa clé : {@link stateOf} ne la montre qu'une fois l'espace accepté, où
   * elle est alors déjà là (lot c).
   */
  async load(shelfKey: string): Promise<void> {
    const reader = this.reader();
    const ahead = this.context.ahead();
    if (reader === null) {
      // L'espace retenu (lot e) : la page part pour lui en même temps que
      // `/me`, et {@link stateOf} reste « en chargement » jusqu'à lui.
      if (ahead !== null) {
        this.shelves.add(shelfKey);
        await this.loadFor(ahead, shelfKey);
      }
      return;
    }
    this.shelves.add(shelfKey);
    await Promise.all([
      this.loadFor(reader, shelfKey),
      ahead === null ? Promise.resolve() : this.loadFor(ahead, shelfKey),
    ]);
  }

  private async loadFor(reader: string, shelfKey: string): Promise<void> {
    const key = keyOf(reader, shelfKey);
    if (this.pages().has(key)) {
      return;
    }
    this.put(key, { status: 'loading' });
    try {
      const page = await firstValueFrom(
        this.request(reader, shelfKey).pipe(timeout(PAGE_TIMEOUT_MS)),
      );
      // Jetée entre-temps (espace refusé) : elle ne revient pas.
      if (!this.pages().has(key)) {
        return;
      }
      this.put(key, { status: 'ready', page });
      // Le réglage d'affichage des allergènes est celui de la boutique, pas
      // d'une audience : le poser depuis une page lue d'avance ne montre rien
      // de l'espace demandé.
      this.allergenDisplay.served(page.allergenDisplay);
    } catch {
      if (this.pages().has(key)) {
        this.put(key, { status: 'failed' });
      }
    }
  }

  /** Jette les pages d'un espace lu d'avance et abandonné. */
  private forget(workspace: string): void {
    const kept = new Map(
      [...this.pages()].filter(([key]) => !key.startsWith(`${workspace}\u0000`)),
    );
    this.pages.set(kept);
  }

  private request(reader: string, shelfKey: string): Observable<PublicStorefrontPageView> {
    const url = `${AUTH_CONFIG.apiBaseUrl}/shop/storefront/${encodeURIComponent(shelfKey)}`;
    if (reader === VISITOR) {
      return this.http.get<PublicStorefrontPageView>(url);
    }
    // L'espace du LECTEUR, pas celui de l'intercepteur : pendant une bascule,
    // celui-ci dit déjà l'espace pas encore accepté (lot c, 2026-11-05).
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<PublicStorefrontPageView>(`${url}/mine`, {
          headers: { Authorization: `Bearer ${token}`, [WORKSPACE_HEADER]: reader },
        }),
      ),
    );
  }

  private put(key: string, state: StorefrontPageState): void {
    this.pages.update((pages) => new Map(pages).set(key, state));
  }
}

/** Une page par lecteur ET par rayon : celle d'un visiteur ne vaut pas pour un pro. */
function keyOf(reader: string, shelfKey: string): string {
  return `${reader}\u0000${shelfKey}`;
}
