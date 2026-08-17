import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';
import type { PricingItemView } from '@lfd/contracts';

import { deltaLabel, isDiscount } from '../pricing-format';

/**
 * **Ce qui sort de la chaîne** — le prix, et de combien il a bougé.
 *
 * L'écart est la seule chose qu'on ne peut PAS lire en comparant deux colonnes
 * sur quatre-vingt-dix lignes : il est donc calculé et posé ici, avec le tarif
 * d'entrée barré au-dessus pour lui donner son point de départ.
 *
 * Le signe est **écrit** (− / +) en plus d'être coloré : une couleur seule ne se
 * lit ni en daltonien, ni imprimée, ni en contraste forcé.
 */
@Component({
  selector: 'app-final-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './final-price.html',
  styleUrl: './final-price.scss',
  host: {
    '[class.is-changed]': 'item().finalCents !== item().canonicalCents',
    '[class.is-floored]': 'item().floored',
  },
})
export class FinalPrice {
  readonly item = input.required<PricingItemView>();

  protected readonly euros = formatEuros;

  protected readonly delta = computed(() => deltaLabel(this.item()));
  protected readonly discount = computed(() => isDiscount(this.item()));
}
