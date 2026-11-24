import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { ClientSubscriptions } from '../../client-subscriptions.service';
import { recurringBasketsCopy } from '../../copy/screens/recurring-baskets.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ShopClock } from '../../shop/shop-clock';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { parisDayOf } from '../../shop/shelf-stock-today.store';
import { BasketCard } from '../basket-card/basket-card';

/**
 * `/paniers-recurrents` — les paniers récurrents de la personne connectée,
 * une carte par panier (plan `plan-bloc-recurrent.md`, § 5 et § 7). C'est
 * l'adresse que l'e-mail des nouvelles CGV donne pour arrêter un panier.
 *
 * Page du shell client : bandeau `clientBanner`, pas de `fold-page-layout`.
 * Écran de société : la route est gardée par `companyWorkspaceGuard`.
 *
 * Les lignes ne portent qu'un SKU : leur nom se lit au catalogue de la
 * boutique, demandé ici ; un article qu'il ne connaît pas garde son SKU.
 */
@Component({
  selector: 'app-baskets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BasketCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './baskets-page.html',
  styleUrl: './baskets-page.scss',
})
export class BasketsPage {
  protected readonly copy = screenCopy('recurringBaskets', recurringBasketsCopy);
  private readonly subscriptions = inject(ClientSubscriptions);
  private readonly clock = inject(ShopClock);

  protected readonly baskets = this.subscriptions.all;
  protected readonly status = computed(() => {
    const status = this.subscriptions.status();
    return status === 'idle' ? 'loading' : status;
  });
  protected readonly today = computed(() => parisDayOf(this.clock.now()));

  constructor() {
    void inject(ShopCatalogue).hydrate();
  }

  protected retry(): Promise<void> {
    return this.subscriptions.reload();
  }
}
