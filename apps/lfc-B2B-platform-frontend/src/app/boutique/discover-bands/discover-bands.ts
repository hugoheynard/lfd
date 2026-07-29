import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';

import { FoldLinkComponent } from 'fold-ng';

/** Une bande de la section « Découvrez » : un visuel carré + son libellé. */
interface DiscoverBand {
  readonly title: string;
  readonly image: string;
}

/**
 * **Découvrez** — un second hero, bleed, sous le carrousel : trois tuiles
 * carrées (Nos pains · Viennoiseries · Sur mesure), chacune un visuel avec son
 * texte en surimpression et un `fold-link` « Voir plus » révélé au survol qui
 * défile jusqu'au catalogue. Titre « Découvrez » en pastille dans le coin
 * haut-gauche. Les tuiles s'empilent sur mobile.
 */
@Component({
  selector: 'app-discover-bands',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldLinkComponent],
  templateUrl: './discover-bands.html',
  styleUrl: './discover-bands.scss',
})
export class DiscoverBands {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly bands: readonly DiscoverBand[] = [
    { title: 'Nos pains', image: 'banners/band-pains.svg' },
    { title: 'Viennoiseries', image: 'banners/band-viennoiseries.svg' },
    { title: 'Sur mesure', image: 'banners/band-custom.svg' },
  ];

  /** « Voir plus » : défile en douceur jusqu'au catalogue de la boutique. */
  protected seeMore(): void {
    if (!this.isBrowser) {
      return;
    }
    this.document
      .getElementById('catalogue')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
