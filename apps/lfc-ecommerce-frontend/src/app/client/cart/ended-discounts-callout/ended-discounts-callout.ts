import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { wallHourLabel } from '../../shop/promotion-offers';
import { ClientCart } from '../client-cart.service';

/**
 * **Les remises à heures qui ont pris fin** — « La remise « Goûter » a pris
 * fin à 19 h » (`documentation/promotions/plan-jours-et-heures.md`, § 8) :
 * le total a changé, on dit pourquoi. Informatif : rien n'est à faire.
 */
@Component({
  selector: 'app-ended-discounts-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './ended-discounts-callout.html',
})
export class EndedDiscountsCallout {
  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly cart = inject(ClientCart);

  protected readonly messages = computed(() => {
    const locale = this.locale.current();
    const product = this.t().product;
    return this.cart.endedDiscounts().map((ended) =>
      fill(this.t().cart.discountEnded, {
        label: locale === 'en' ? ended.label.en : locale === 'it' ? ended.label.it : ended.label.fr,
        at: wallHourLabel(ended.endedAt, locale, product),
      }),
    );
  });
}
