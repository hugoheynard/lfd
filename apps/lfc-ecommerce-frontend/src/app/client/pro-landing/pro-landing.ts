import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldHeroCardComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';
import { ClientChrome } from '../client-chrome.service';
import { fill } from '../copy/client-copy.service';
import { proLandingCopy } from '../copy/screens/pro-landing.copy';
import { screenCopy } from '../copy/shop-copy-composer';
import { bestPickupDiscount, discountLabel } from '../shop/pickup-discount';
import { ProPickupListGateway } from '../shop/pro-pickup-list.gateway';

/**
 * Où revient un pro après connexion : l'accueil de son espace. La même cible
 * que la porte pro de l'inscription (`AFTER_ENTRY_PRO`, `accueil-page.ts`,
 * relu le 2026-10-19) — recopiée plutôt qu'importée, l'inscription n'exportant
 * pas sa constante et ne devant pas être touchée.
 */
export const PRO_HOME = '/mon-compte';

/** L'inscription, ouverte du côté pro (`#pro`, cf. `accueil-page.ts`). */
export const PRO_REGISTER = '/inscription#pro';

/** La boutique, ouverte aux visiteurs (sans garde). */
export const SHOP = '/boutique';

/** La page des particuliers, pour la dualité. */
export const PERSONAL_LANDING = '/bienvenue';

/**
 * **L'accueil pro public** (`/pro`) — la page vers laquelle l'agence web envoie
 * un professionnel non connecté (Hugo, 2026-10-19).
 *
 * 🔴 RIEN DU COMPTE N'Y EST LU. Les portes de `/bienvenue` sont remplies selon
 * le statut du client connecté ; un visiteur n'en a pas. Les deux modes sont
 * écrits dans la copie, et la seule lecture est publique : les points de
 * retrait ouverts aux pros (`GET /pickup-addresses?audience=pro`), qui
 * précisent la carte du retrait. Échec ou liste vide : elle garde ses mots
 * génériques — pas d'erreur rouge sur une page d'accueil.
 *
 * Même châssis que `/bienvenue` : pas de `fold-page-layout` ni de bandeau
 * `clientBanner`, l'accroche d'encre vit dans la page et la lèvre s'éteint.
 */
@Component({
  selector: 'app-pro-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldHeroCardComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
    RouterLink,
  ],
  templateUrl: './pro-landing.html',
  styleUrl: './pro-landing.scss',
})
export class ProLanding {
  protected readonly c = screenCopy('proLanding', proLandingCopy);
  protected readonly registerHref = PRO_REGISTER;
  protected readonly personalLanding = PERSONAL_LANDING;
  protected readonly shop = SHOP;

  /** `null` tant que la lecture court ; vide si elle échoue. */
  private readonly points = signal<readonly PickupAddressView[] | null>(null);
  protected readonly pointsLoading = computed(() => this.points() === null);

  /** « 3 points de retrait », ou le nom du seul — `null` sans point lu. */
  protected readonly pointsLine = computed(() => {
    const points = this.points() ?? [];
    const copy = this.c().pickupPoints;
    const [only] = points;
    if (only === undefined) return null;
    return points.length === 1
      ? fill(copy.one, { place: only.label || only.ville })
      : fill(copy.many, { count: String(points.length) });
  });

  /** La meilleure remise pro, sinon la mention générique de la carte. */
  protected readonly pickupNote = computed(() => {
    const best = bestPickupDiscount(this.points() ?? [], 'b2b');
    return best === null
      ? this.c().pickup.note
      : fill(this.c().pickupPoints.discount, { value: discountLabel(best) });
  });

  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly panels = inject(FoldPanelHostService);

  constructor() {
    const chrome = inject(ClientChrome);
    effect(() => chrome.kicker.set(this.c().kicker));
    chrome.back.set(null);
    // Le menu suit la reconnaissance, comme sur `/bienvenue`.
    effect(() => chrome.menu.set(this.auth.isAuthenticated()));
    // L'accroche d'encre suit la barre : ni lèvre, ni bande fixe en pile.
    chrome.bandLip.set(false);
    chrome.bandNarrow.set(false);
    inject(ProPickupListGateway)
      .list()
      .then(
        (points) => this.points.set(points),
        () => this.points.set([]),
      );
    inject(DestroyRef).onDestroy(() => {
      chrome.bandLip.set(true);
      chrome.bandNarrow.set(true);
    });
  }

  /**
   * La connexion de toute la boutique (`SignInDialog`), retour sur l'accueil de
   * l'espace pro. Déjà reconnu, on n'a rien à lui redemander : on l'y mène.
   */
  protected signIn(): void {
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(PRO_HOME);
      return;
    }
    SignInDialog.open(this.panels, PRO_HOME);
  }
}
