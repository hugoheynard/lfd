import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import {
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import {
  CATALOGUE_VIEW_OPTIONS,
  CATALOGUE_VIEW_OPTIONS_MOBILE,
  type CatalogueView,
  resolveCatalogueView,
  toCatalogueView,
} from '../../catalogue/catalogue-view';

import {
  FoldBannerCarouselComponent,
  type FoldBanner,
  type FoldProduct,
  type FoldProductOrder,
} from '../../../shared';
import { AccountService } from '../../account/account.service';
import { CATEGORIES, PRODUCTS } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FavoritesService } from '../../data/favorites.service';
import { ProductCatalogue } from '../../catalogue/product-catalogue/product-catalogue';
import { DiscoverBands } from '../discover-bands/discover-bands';
import { FeaturedRail, type FeaturedItem } from '../featured-rail/featured-rail';

/** Sélection éditoriale : le croissant (best-seller) au centre des trois. */
const FEATURED_SPEC: readonly {
  readonly id: string;
  readonly flag: string;
  readonly highlight: boolean;
}[] = [
  { id: 'VIE-002', flag: '', highlight: false },
  { id: 'VIE-001', flag: 'Best seller', highlight: true },
  { id: 'PAI-001', flag: '', highlight: false },
];

/** Résout la sélection en produits réels ; ignore un id absent du catalogue. */
function buildFeatured(): FeaturedItem[] {
  const out: FeaturedItem[] = [];
  for (const spec of FEATURED_SPEC) {
    const product = PRODUCTS.find((p) => p.id === spec.id);
    if (product) {
      out.push({ product, flag: spec.flag, highlight: spec.highlight });
    }
  }
  return out;
}

/**
 * Boutique — le point d'entrée du client pro : un hero de bannières en pleine
 * largeur, une sélection « à la une », puis le catalogue complet (filtrable,
 * paginé) partagé avec la page Catalogue.
 */
@Component({
  selector: 'app-boutique-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldViewToggleComponent,
    FoldBannerCarouselComponent,
    ProductCatalogue,
    DiscoverBands,
    FeaturedRail,
  ],
  templateUrl: './boutique-page.html',
  styleUrl: './boutique-page.scss',
})
export class BoutiquePage {
  protected readonly favorites = inject(FavoritesService);
  private readonly cart = inject(CartService);
  private readonly account = inject(AccountService);

  protected readonly products = PRODUCTS;
  protected readonly categories = CATEGORIES;

  /** Vrai sous le point de rupture mobile — pilote la liste de vues offertes et
   *  la vue effective (la grille paginée n'existe pas sur petit écran). */
  private readonly narrow = signal(false);

  /** Segments du sélecteur de vue (posé dans l'action de la section) — deux vues
   *  sur mobile (« Grille » = rayons, « Liste »), les trois sur desktop. */
  protected readonly catalogueViewOptions = computed(() =>
    this.narrow() ? CATALOGUE_VIEW_OPTIONS_MOBILE : CATALOGUE_VIEW_OPTIONS,
  );

  /** Vue du catalogue **au choix du client**, lue depuis la préférence persistée
   *  (`nav_prefs` via `GET /me`) ; défaut « grille » tant qu'aucun choix. La
   *  source de vérité est le compte — l'écriture passe par `AccountService`. */
  protected readonly catalogueView = computed<CatalogueView>(
    () => this.account.navPrefs().catalogueView ?? 'cards',
  );

  /** Vue réellement rendue : `cards` retombe sur `shelves` sous le breakpoint. */
  protected readonly effectiveView = computed(() =>
    resolveCatalogueView(this.catalogueView(), this.narrow()),
  );

  constructor() {
    // App browser-only : `matchMedia` est sûr. On suit le point de rupture mobile
    // pour offrir la bonne liste de vues et éviter une vue « cards » orpheline.
    const mql = window.matchMedia('(max-width: 640px)');
    const sync = (): void => this.narrow.set(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener('change', sync));
  }

  /** Applique + **persiste** la vue choisie (valeur brute → union). Le compte est
   *  la source de vérité : `catalogueView` reflète le changement via le signal. */
  protected setCatalogueView(value: string): void {
    this.account.setCatalogueView(toCatalogueView(value));
  }

  /** La bannière de marque est toujours en tête via {@link leadId}. */
  protected readonly leadBannerId = 'folie-coffee';

  protected readonly banners: readonly FoldBanner[] = [
    {
      id: 'folie-coffee',
      image: 'banners/folie-coffee.svg',
      imageAlt: 'Montagnes au petit matin dans des tons bleus et crème',
      eyebrow: 'Bienvenue',
      title: 'La Folie Coffee',
      subtitle:
        'Vos viennoiseries, pains et pâtisseries, en direct de notre atelier — pour les professionnels.',
      cta: { label: 'Explorer le catalogue', icon: 'grid', routerLink: '/boutique' },
    },
    // Habillages : fond seul, texte + boutons à définir plus tard.
    { id: 'habillage-1', image: 'banners/banner-2.svg', imageAlt: '' },
    { id: 'habillage-2', image: 'banners/banner-3.svg', imageAlt: '' },
  ];

  /** Sélection mise en avant : 3 produits, le best-seller (croissant) au milieu. */
  protected readonly featured: readonly FeaturedItem[] = buildFeatured();

  protected readonly notifyIds = signal<readonly string[]>([]);

  protected onAdd(order: FoldProductOrder): void {
    this.cart.add(order.product.id, order.quantity);
  }

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }

  protected onNotify(product: FoldProduct): void {
    this.notifyIds.update((ids) => [...ids, product.id]);
  }
}
