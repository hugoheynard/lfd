import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  activeCarousel,
  formatSpec,
  mediaFitOf,
  mobileSequence,
  mobileSide,
} from '@lfd/storefront-layout';

import { type EditorBlock, toneOf } from '../storefront-block';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';

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
  readonly blocks = input.required<readonly EditorBlock[]>();
  readonly rows = input.required<number>();
  /** Les objets qui n'ont rien à montrer : la boutique rend leurs cases au rayon. */
  readonly returned = input<ReadonlySet<string>>(new Set());

  protected readonly items = computed(() => mobileSequence(this.blocks(), this.rows()));
  protected readonly spec = formatSpec;
  protected readonly sideOf = mobileSide;
  protected readonly fitOf = mediaFitOf;
  protected readonly toneOf = toneOf;
  /** Ce que la maquette simule : rien pour un seul contenu, même avec des réglages gardés. */
  protected readonly carouselOf = activeCarousel;
}
