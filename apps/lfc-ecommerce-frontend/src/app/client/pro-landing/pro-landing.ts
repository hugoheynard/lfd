import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PickupAddressView, ShopFeaturedItemView, ShopImageView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldHeroCardComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { HOME_PAGE } from '@lfd/storefront-layout';
import type { StorefrontImage as DoorImage } from '@lfd/contracts';
import { AuthFacade } from '../../auth/auth.facade';
import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';
import { ClientChrome } from '../client-chrome.service';
import { fill } from '../copy/client-copy.service';
import { ClientLocale } from '../client-locale.service';
import { accueilPublicCopy } from '../copy/screens/accueil-public.copy';
import { CallDialog } from '../shop/call-dialog/call-dialog';
import { ContactDialog } from '../shop/contact-dialog/contact-dialog';
import { ContactSettingsStore, phonesFor, telHref } from '../shop/contact-settings.store';
import { ProFeaturedCard } from './pro-featured-card/pro-featured-card';
import { proLandingCopy } from '../copy/screens/pro-landing.copy';
import { screenCopy } from '../copy/shop-copy-composer';
import { bestPickupDiscount, discountLabel } from '../shop/pickup-discount';
import { mediaSrcset, SHEET_WIDTHS, sizedMedia } from '../shop/media-source';
import { ShopStorefront } from '../shop/storefront/shop-storefront.store';
import { ProFeaturedGateway } from '../shop/pro-featured.gateway';
import { ProPickupListGateway } from '../shop/pro-pickup-list.gateway';
import { objectPositionOf, shelfArtOf } from '../shop/shelf-display';

/**
 * Un incontournable tel que la carte éditoriale le pose : l'ouverture (la
 * grande image), sinon la vignette, sinon l'illustration du rayon.
 */
export interface FeaturedCard {
  readonly sku: string;
  readonly name: string;
  readonly note: string | null;
  readonly label: string;
  readonly alt: string;
  readonly src: string;
  readonly srcset: string;
  readonly position: string;
}

function artOfFeatured(item: ShopFeaturedItemView): ShopImageView {
  return (
    item.image ??
    item.thumbnail ?? { url: shelfArtOf(item.shelfId), alt: item.name, width: null, height: null }
  );
}

/** Une photo de porte en valeur CSS, à la largeur d'une fiche ; `null` sans photo. */
function photoOf(image: DoorImage | null | undefined): string | null {
  return image ? `url(${JSON.stringify(sizedMedia(image.url, SHEET_WIDTHS[1]))})` : null;
}

/** Son recadrage (`background-position`) ; `null` sans photo. */
function focusOf(image: DoorImage | null | undefined): string | null {
  return image ? objectPositionOf(image) : null;
}

/**
 * Les largeurs d'une carte éditoriale : jusqu'à une demi-feuille au bureau,
 * toute la largeur d'un téléphone — et leur double pour la haute densité.
 */
export const FEATURED_WIDTHS = [560, 1120] as const;

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
    FoldIconComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
    ProFeaturedCard,
    RouterLink,
  ],
  templateUrl: './pro-landing.html',
  styleUrl: './pro-landing.scss',
})
export class ProLanding {
  protected readonly c = screenCopy('proLanding', proLandingCopy);
  protected readonly registerHref = PRO_REGISTER;

  /**
   * Les mots de `/bienvenue` que cette page reprend sans les redire : les deux
   * verbes du contact (« Appeler », « Écrire »).
   */
  protected readonly welcome = screenCopy('accueilPublic', accueilPublicCopy);

  private readonly locale = inject(ClientLocale);
  private readonly contactSettings = inject(ContactSettingsStore);

  /**
   * Les numéros et les deux verbes du contact, tels que `/bienvenue` les
   * compose pour un PRO (`accueil-public.ts`, `contact`, relu le 2026-10-19) :
   * le réglage public `GET /contact-settings` côté `b2b`, sinon le numéro de
   * `CONTACT_CARD_DEFAULTS`. Aucune lecture qui demande une connexion.
   */
  protected readonly contact = computed(() => {
    const words = this.welcome().contact;
    return {
      phones: phonesFor(this.contactSettings.settings(), 'b2b', this.locale.current()),
      call: words.call,
      write: words.write,
    };
  });

  protected readonly telHref = telHref;

  /** Plusieurs numéros : « Nous appeler », comme la bande de `/bienvenue`. */
  protected call(): void {
    CallDialog.open(this.panels, { phones: this.contact().phones });
  }

  /** « Nous écrire », le même dialogue que sur `/bienvenue`. */
  protected write(): void {
    ContactDialog.open(this.panels);
  }

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

  /** `null` tant que la lecture court ; vide si elle échoue — la section se tait. */
  private readonly featuredItems = signal<readonly ShopFeaturedItemView[] | null>(null);
  protected readonly featuredLoading = computed(() => this.featuredItems() === null);

  /** Les cartes des incontournables, aux tailles de la carte éditoriale. */
  protected readonly featured = computed<readonly FeaturedCard[]>(() =>
    (this.featuredItems() ?? []).map((item) => {
      const art = artOfFeatured(item);
      return {
        sku: item.sku,
        name: item.name,
        note: item.note,
        label: fill(this.c().featured.signInLabel, { name: item.name }),
        alt: art.alt,
        src: sizedMedia(art.url, FEATURED_WIDTHS[0]),
        srcset: mediaSrcset(art.url, FEATURED_WIDTHS),
        position: objectPositionOf(art),
      };
    }),
  );

  /**
   * Les photos des deux portes, celles de `/bienvenue` (`accueil-public.ts`,
   * `doorPhoto`/`courierPhoto`, relu le 2026-10-19) : la page `home` de la
   * vitrine, servie à la largeur d'une fiche, recadrée sur son point focal.
   * `null` sans photo : la carte garde son aplat.
   */
  private readonly storefront = inject(ShopStorefront);
  private readonly homePage = computed(() => {
    const state = this.storefront.stateOf(HOME_PAGE);
    return state?.status === 'ready' ? state.page : null;
  });
  protected readonly pickupPhoto = computed(() => photoOf(this.homePage()?.pickupDoorImage));
  protected readonly pickupPosition = computed(() => focusOf(this.homePage()?.pickupDoorImage));
  protected readonly courierPhoto = computed(() => photoOf(this.homePage()?.deliveryDoorImage));
  protected readonly courierPosition = computed(() => focusOf(this.homePage()?.deliveryDoorImage));

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
    // La page porte déjà en grand l'entrée et la commande : la barre ne les
    // double pas (Hugo, 2026-10-19).
    chrome.cart.set(false);
    chrome.entry.set(false);
    void this.contactSettings.hydrate();
    // La page `home` de la vitrine, comme `/bienvenue` : relue si le lecteur change.
    effect(() => {
      this.storefront.reader();
      untracked(() => void this.storefront.load(HOME_PAGE));
    });
    inject(ProPickupListGateway)
      .list()
      .then(
        (points) => this.points.set(points),
        () => this.points.set([]),
      );
    inject(ProFeaturedGateway)
      .list()
      .then(
        (items) => this.featuredItems.set(items),
        () => this.featuredItems.set([]),
      );
    inject(DestroyRef).onDestroy(() => {
      chrome.bandLip.set(true);
      chrome.bandNarrow.set(true);
      chrome.cart.set(true);
      chrome.entry.set(true);
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
