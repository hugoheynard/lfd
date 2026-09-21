import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';

import { Chart } from '../../../../shared/chart/chart';
import { ChartNote } from '../../../../shared/chart-note/chart-note';
import { categoryMix, foldExtras, planRatios, type MixArticle } from '../mercuriale-mix';
import { mixAreaOption, mixPieOption } from '../mix-chart';

/**
 * **Ce que la mercuriale pèse, rayon par rayon**, en tête de la grille.
 *
 * La question posée ici n'est pas celle d'un article mais celle du lot : sur quoi
 * repose le chiffre de ce devis, et ce partage tient-il si le client n'en prend
 * qu'une partie ?
 *
 * L'axe est une **fraction du plan** et non un volume : les articles n'ont pas le
 * même volume prévu, et les additionner sur un axe de quantités mélangerait des
 * baguettes et des croissants. Faire varier tout le plan d'un même facteur pose
 * la vraie question, et la pose sur tous les articles à la fois.
 */
/** La lecture du second anneau — elle ne dépend pas de la forme du premier. */
const READ_CONCEDED =
  "Le second anneau est le même partage, sur les euros LÂCHÉS : un rayon qui pèse 15 % du chiffre et 40 % de la remise est l'endroit où l'argent est parti. L'écart en pourcent est écrit sur chaque arc, mais ce sont bien des euros qui forment le tout — des taux ne s'additionnent pas.";

@Component({
  selector: 'app-mercuriale-mix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, ChartNote],
  templateUrl: './mercuriale-mix.html',
  styleUrl: './mercuriale-mix.scss',
})
export class MercurialeMix {
  readonly articles = input.required<readonly MixArticle[]>();

  protected readonly euros = formatEuros;

  protected readonly mix = computed(() => foldExtras(categoryMix(this.articles(), planRatios())));

  /** Aire ou anneau : la forme suit la donnée, cf. `mix-chart`. */
  protected readonly option = computed(() => {
    const mix = this.mix();
    return mix.hasTier ? mixAreaOption(mix) : mixPieOption(mix, 'revenue');
  });

  /**
   * **L'anneau des remises** — mêmes couleurs, même forme que celui du chiffre.
   *
   * Ce que la comparaison des deux montre : un rayon qui pèse 15 % du chiffre et
   * 40 % de la remise est l'endroit où l'argent est parti. Rien d'autre à
   * l'écran ne le dit.
   */
  protected readonly concededOption = computed(() => mixPieOption(this.mix(), 'conceded'));

  protected readonly read = computed(() => `${this.readRevenue()} ${READ_CONCEDED}`);

  private readRevenue(): string {
    return this.mix().hasTier
      ? "Une bande qui s'amincit quand le plan grossit est un rayon qui porte un palier : sa part du chiffre baisse à mesure que le client commande."
      : 'Aucune grille de ce lot ne comporte de palier : la part de chaque rayon est la même à tout volume, et un tracé par volume ne montrerait que des bandes parallèles.';
  }
}
