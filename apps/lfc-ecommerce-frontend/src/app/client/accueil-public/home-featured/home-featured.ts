import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientCopyService } from '../../copy/client-copy.service';
import { proLandingCopy } from '../../copy/screens/pro-landing.copy';
import { mediaSrcset, sizedMedia } from '../../shop/media-source';
import { PieceRequest } from '../../shop/piece-request.service';
import { objectPositionOf } from '../../shop/shelf-display';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { shelfPriceLabel, ShopPriceBasis } from '../../shop/shop-price-basis.service';
import { ProFeaturedCard } from '../../pro-landing/pro-featured-card/pro-featured-card';
import { artOfFeatured, FEATURED_WIDTHS, type FeaturedCard } from '../../pro-landing/pro-landing';

/** Une carte de l'accueil : celle de `/pro`, plus son prix. */
interface HomeFeaturedCard {
  readonly card: FeaturedCard;
  readonly price: string;
}

/**
 * **« Nos incontournables » à l'accueil** (Hugo, 2026-10-19) : les articles
 * que le catalogue déjà lu par l'accueil marque `isFeatured`, dans la carte
 * éditoriale de `/pro` — mais AVEC leur prix, parce qu'ici le catalogue est
 * celui du lecteur.
 *
 * La mise en avant suit l'audience du catalogue servi : un visiteur et un
 * particulier voient celle des particuliers, un pro connecté celle des pros
 * (la vue `/mine` porte la sienne) — ses incontournables, à SON tarif, hors
 * taxe comme partout dans sa boutique (`ShopPriceBasis`).
 *
 * La carte ouvre la fiche par {@link PieceRequest}, comme « Notre sélection ».
 * Aucun article mis en avant : rien, ni titre ni section.
 */
@Component({
  selector: 'app-home-featured',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProFeaturedCard],
  templateUrl: './home-featured.html',
  styleUrl: './home-featured.scss',
})
export class HomeFeatured {
  private readonly catalogue = inject(ShopCatalogue);
  private readonly basis = inject(ShopPriceBasis);
  private readonly pieces = inject(PieceRequest);
  private readonly t = inject(ClientCopyService).t;
  protected readonly c = screenCopy('proLanding', proLandingCopy);

  protected readonly cards = computed<readonly HomeFeaturedCard[]>(() => {
    const ttc = this.basis.showsTtc();
    const shop = this.t().shop;
    return this.catalogue
      .items()
      .filter((item) => item.isFeatured)
      .map((item) => {
        const art = artOfFeatured(item);
        const price = `${shelfPriceLabel(item, ttc)} ${ttc ? shop.ttcSuffix : shop.htSuffix}`;
        return {
          price,
          card: {
            sku: item.sku,
            name: item.name,
            note: item.note,
            label: `${item.name}, ${price}`,
            alt: art.alt,
            src: sizedMedia(art.url, FEATURED_WIDTHS[0]),
            srcset: mediaSrcset(art.url, FEATURED_WIDTHS),
            position: objectPositionOf(art),
          },
        };
      });
  });

  protected open(sku: string): void {
    this.pieces.open(sku);
  }
}
