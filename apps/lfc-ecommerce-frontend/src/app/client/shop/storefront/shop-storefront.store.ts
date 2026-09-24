import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { PublicStorefrontPageView } from '@lfd/contracts';
import { firstValueFrom, timeout } from 'rxjs';

import { AUTH_CONFIG } from '../../../auth/auth.config';

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
 * **La page de vitrine de chaque rayon**, lue une fois par rayon
 * (`plan-vitrine-enregistrement.md`, lot 4 ; `GET /shop/storefront/:shelfKey`,
 * publique). « Tout » est la clé `all` ({@link ALL_SHELVES}).
 *
 * Comme le catalogue ({@link ShopCatalogue}), elle n'est pas rafraîchie pendant
 * la visite : une grille qui se recomposerait sous le pouce déplacerait ce
 * qu'on s'apprête à toucher. Contrairement à lui, elle ne dépend pas du
 * lecteur — la vitrine est la même pour tous, et le PRIX qu'elle montre vient
 * du catalogue, qui, lui, suit l'espace.
 *
 * Un échec (réseau, 5xx, délai dépassé) est retenu : réessayer à chaque
 * changement de rayon ferait clignoter la grille. La page suivante du même
 * rayon attendra la prochaine visite.
 */
@Injectable({ providedIn: 'root' })
export class ShopStorefront {
  private readonly http = inject(HttpClient);
  private readonly pages = signal<ReadonlyMap<string, StorefrontPageState>>(new Map());

  /** L'état de la page d'un rayon ; `null` tant que personne ne l'a demandée. */
  stateOf(shelfKey: string): StorefrontPageState | null {
    return this.pages().get(shelfKey) ?? null;
  }

  /** Demande la page d'un rayon. Idempotent : une page chargée ou en cours ne se redemande pas. */
  async load(shelfKey: string): Promise<void> {
    if (this.pages().has(shelfKey)) {
      return;
    }
    this.put(shelfKey, { status: 'loading' });
    try {
      const page = await firstValueFrom(
        this.http
          .get<PublicStorefrontPageView>(
            `${AUTH_CONFIG.apiBaseUrl}/shop/storefront/${encodeURIComponent(shelfKey)}`,
          )
          .pipe(timeout(PAGE_TIMEOUT_MS)),
      );
      this.put(shelfKey, { status: 'ready', page });
    } catch {
      this.put(shelfKey, { status: 'failed' });
    }
  }

  private put(shelfKey: string, state: StorefrontPageState): void {
    this.pages.update((pages) => new Map(pages).set(shelfKey, state));
  }
}
