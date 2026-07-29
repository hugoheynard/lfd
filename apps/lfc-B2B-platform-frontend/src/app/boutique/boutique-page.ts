import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { FoldPageLayoutComponent, FoldPageSectionComponent } from 'fold-ng';

import {
  FoldBannerCarouselComponent,
  FoldProductCardComponent,
  type FoldBanner,
  type FoldProduct,
} from '../../shared';
import { CATEGORIES, PRODUCTS } from '../data/catalogue-seed';
import { FavoritesService } from '../data/favorites.service';
import { SiteFooter } from '../footer/site-footer';
import { ProductCatalogue } from '../catalogue/product-catalogue/product-catalogue';

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
    FoldProductCardComponent,
    ProductCatalogue,
    SiteFooter,
  ],
  templateUrl: './boutique-page.html',
  styleUrl: './boutique-page.scss',
})
export class BoutiquePage {
  protected readonly favorites = inject(FavoritesService);

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

  /** Sélection mise en avant (les premiers du catalogue). */
  protected readonly featured: readonly FoldProduct[] = PRODUCTS.slice(0, 4);

  protected readonly cartIds = signal<readonly string[]>([]);
  protected readonly notifyIds = signal<readonly string[]>([]);

  protected onAdd(product: FoldProduct): void {
    this.cartIds.update((ids) => [...ids, product.id]);
  }

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }

  protected onNotify(product: FoldProduct): void {
    this.notifyIds.update((ids) => [...ids, product.id]);
  }
}
