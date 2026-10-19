import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  ResolveEnd,
  Router,
  type Event,
} from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';

/** Le fragment que la landing `/pro` pose sur le lien vers la boutique. */
export const PRO_VISIT_FRAGMENT = 'pro';

/** Le premier segment de la boutique — la seule adresse où `#pro` vaut. */
const SHOP_SEGMENT = 'boutique';

/**
 * **La visite pro** — un visiteur venu de la landing `/pro` (`/boutique#pro`)
 * lit la boutique aux tarifs professionnels hors taxe (Hugo, 2026-10-19).
 *
 * 🔴 **L'adresse dit ce qu'on voit** (Hugo, 2026-10-19) : la visite est active
 * si et seulement si l'adresse de la boutique porte `#pro`. Elle a d'abord été
 * gardée en `sessionStorage` : revenu sur `/boutique` sans `#pro`, on restait
 * en hors taxe sans rien à l'écran pour l'expliquer. Plus aucune mémoire —
 * une ancienne clé `lfd.shop.pro-visit` restée dans l'onglet n'est plus lue.
 *
 * 🔴 **Elle ne vaut que pour un visiteur.** Une personne reconnue garde
 * l'affichage de son espace : c'est sa société, pas un fragment d'URL, qui
 * décide de son prix et de son assiette (`ShopPriceBasis`).
 *
 * L'adresse suivie est celle qui va s'afficher dès `ResolveEnd` — la page
 * naît déjà en pro, sa première vitrine aussi — et celle qui reste en cas
 * d'annulation. Les gardes la lisent AVANT `ResolveEnd` : `noProVisitGuard`
 * voit donc encore la boutique d'où l'on part.
 */
@Injectable({ providedIn: 'root' })
export class ProVisit {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter(
        (event: Event) =>
          event instanceof ResolveEnd ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      map((event) => (event instanceof ResolveEnd ? event.urlAfterRedirects : this.router.url)),
    ),
    { initialValue: this.router.url },
  );

  private readonly onProShop = computed(() => {
    const tree = this.router.parseUrl(this.url());
    const first = tree.root.children['primary']?.segments[0]?.path;
    return first === SHOP_SEGMENT && tree.fragment === PRO_VISIT_FRAGMENT;
  });

  /** Vrai quand la boutique s'affiche en pro pour un visiteur non reconnu. */
  readonly active = computed(() => this.onProShop() && !this.auth.isAuthenticated());

  /** « Voir les prix TTC » : `#pro` quitte l'adresse, et la visite avec lui. */
  leave(): Promise<boolean> {
    const tree = this.router.parseUrl(this.router.url);
    tree.fragment = null;
    return this.router.navigateByUrl(tree, { replaceUrl: true });
  }
}
