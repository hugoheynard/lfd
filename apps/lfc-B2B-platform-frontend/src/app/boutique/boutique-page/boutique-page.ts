import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { FoldPageLayoutComponent, FoldPageSectionComponent } from 'fold-ng';

import { FoldBannerCarouselComponent, type FoldBanner, type FoldProduct } from '../../../shared';
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

  protected readonly products = PRODUCTS;
  protected readonly categories = CATEGORIES;

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

  protected onAdd(product: FoldProduct): void {
    this.cart.add(product.id);
  }

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }

  protected onNotify(product: FoldProduct): void {
    this.notifyIds.update((ids) => [...ids, product.id]);
  }
}
