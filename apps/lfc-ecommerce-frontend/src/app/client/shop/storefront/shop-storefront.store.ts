import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { PublicStorefrontPageView } from '@lfd/contracts';
import { firstValueFrom, type Observable, switchMap, timeout } from 'rxjs';

import { AUTH_CONFIG } from '../../../auth/auth.config';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientWorkspace } from '../../client-workspace.service';

/** Le lecteur d'un visiteur non reconnu — la vitrine publique. */
const VISITOR = 'visiteur';

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
 * lecteur (`plan-vitrine-enregistrement.md`, lot 4). « Tout » est la clé `all`
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
  private readonly workspace = inject(ClientWorkspace);
  private readonly pages = signal<ReadonlyMap<string, StorefrontPageState>>(new Map());

  /**
   * Pour qui la vitrine se lit : {@link VISITOR}, l'espace de la personne
   * reconnue, ou `null` tant que cet espace n'est pas connu. Un écran qui
   * charge la page le suit, pour relire quand il change.
   */
  readonly reader = computed<string | null>(() =>
    this.auth.isAuthenticated() ? this.workspace.current() : VISITOR,
  );

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
   */
  async load(shelfKey: string): Promise<void> {
    const reader = this.reader();
    if (reader === null) {
      return;
    }
    const key = keyOf(reader, shelfKey);
    if (this.pages().has(key)) {
      return;
    }
    this.put(key, { status: 'loading' });
    try {
      const page = await firstValueFrom(
        this.request(reader, shelfKey).pipe(timeout(PAGE_TIMEOUT_MS)),
      );
      this.put(key, { status: 'ready', page });
    } catch {
      this.put(key, { status: 'failed' });
    }
  }

  private request(reader: string, shelfKey: string): Observable<PublicStorefrontPageView> {
    const url = `${AUTH_CONFIG.apiBaseUrl}/shop/storefront/${encodeURIComponent(shelfKey)}`;
    if (reader === VISITOR) {
      return this.http.get<PublicStorefrontPageView>(url);
    }
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<PublicStorefrontPageView>(`${url}/mine`, {
          headers: { Authorization: `Bearer ${token}` },
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
