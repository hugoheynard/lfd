import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { activeCarousel } from '../storefront-carousel';
import { formatSpec, type PlacedBlock } from '../storefront-grid';
import { mediaFitOf, mobileSide, toneOf } from '../storefront-media';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';
import { mobileSequence } from '../storefront-mobile';

/**
 * L'aperçu « Mobile » de l'éditeur « Vitrine » : la pile DÉDUITE de la page
 * de bureau — 2 colonnes, ordre de lecture, formats traduits, cases libres en
 * « article du rayon ». Purement présentationnel : il ne s'édite pas.
 */
@Component({
  selector: 'app-storefront-mobile-preview',
  imports: [StorefrontMediaMock],
  templateUrl: './storefront-mobile-preview.html',
  styleUrl: './storefront-mobile-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontMobilePreview {
  /** Les objets de la page éditée (un rayon). */
  readonly blocks = input.required<readonly PlacedBlock[]>();
  readonly rows = input.required<number>();

  protected readonly items = computed(() => mobileSequence(this.blocks(), this.rows()));
  protected readonly spec = formatSpec;
  protected readonly sideOf = mobileSide;
  protected readonly fitOf = mediaFitOf;
  protected readonly toneOf = toneOf;
  /** Ce que la maquette simule : rien pour un seul contenu, même avec des réglages gardés. */
  protected readonly carouselOf = activeCarousel;
}
