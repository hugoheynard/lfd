import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';
import type { PricingItemView } from '@lfd/contracts';

import { deltaLabel, isDiscount, stageTrail } from '../pricing-format';

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
})
export class FinalPrice {
  readonly item = input.required<PricingItemView>();

  protected readonly euros = formatEuros;

  protected readonly delta = computed(() => deltaLabel(this.item()));
  protected readonly discount = computed(() => isDiscount(this.item()));

  /** Les étages qui ont agi, nommés — le détail vit dans le chemin du prix. */
  protected readonly trail = computed(() => stageTrail(this.item()));

  /**
   * **La grille du barème** : le prix à chaque palier.
   *
   * C'est la réponse à la question qu'un commercial pose au téléphone — « à
   * combien je lui fais les 100 ? » — et elle n'existait nulle part : l'écran ne
   * montrait que le prix à l'unité, en disant en tête que les paliers de volume
   * ne s'y voyaient pas.
   */
  protected readonly tiers = computed(() => this.item().volumeTiers ?? []);

  /** La remise du palier, en clair. Toujours une baisse : un barème n'augmente pas. */
  protected tierDiscount(discountBp: number): string {
    return `−${(discountBp / 100).toFixed(1).replace('.', ',')} %`;
  }
}
