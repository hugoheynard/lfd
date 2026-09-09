import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';
import { FoldSurfaceDirective } from 'fold-ng';

import { deltaLabel, isDiscount, pathOf, priceVerdict } from '../pricing-format';
import type { PriceChain } from '../pricing-format';

/**
 * **Le chemin du prix d'un article, déplié.**
 *
 * L'écran connaissait `steps` depuis toujours et n'en montrait que la
 * cardinalité — « 3 étage(s) ». Trois faits que le moteur calcule pour décider,
 * et qu'il jetait ensuite : quel étage a agi et à quelle portée, lequel a été
 * supplanté et par qui, et combien la limite a repris sur ce qui avait été
 * accordé. Le troisième est le plus cher : une règle posée, un geste consenti,
 * et presque rien qui arrive au client — sans que rien ne le dise.
 *
 * **Un article à la fois**, et c'est délibéré : dépliée sur cent lignes, la
 * cascade serait illisible. D'où la sélection de ligne dans la grille, et la
 * trace ancrée en haut plutôt qu'un dépli en place qui ferait sauter la grille
 * de cent trente pixels à chaque clic.
 *
 * **Sur le chrome**, pas sur le papier. Le partage n'est pas décoratif : il
 * sépare ce que le moteur a *conclu* — non modifiable, à lire — de l'établi où
 * l'on pose des règles. `foldSurface="chrome"` repointe la polarité entière du
 * sous-arbre, encres d'étage comprises ; aucune couleur n'est écrite ici.
 */
@Component({
  selector: 'app-price-path',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective],
  templateUrl: './price-path.html',
  styleUrl: './price-path.scss',
})
export class PricePath {
  /**
   * **La chaîne**, et non plus la résolution du jour.
   *
   * 🔴 Le même dessin sert deux choses qu'il ne faut surtout pas confondre : le
   * prix que le moteur ferait **aujourd'hui**, et celui qui a été **facturé**.
   * L'entrée porte donc son origine, le panneau la dit, et il n'y a pas de faux
   * item vivant fabriqué pour l'occasion — c'est la seule façon d'éviter qu'on
   * défende, en litige, ce que le moteur ferait maintenant (R25, lot 3).
   */
  readonly chain = input.required<PriceChain>();

  /** Refermer la trace, donc désélectionner la ligne — un seul geste. */
  readonly dismissed = output<void>();

  protected readonly euros = formatEuros;

  protected readonly legs = computed(() => pathOf(this.chain()));
  /** La phrase, en segments : le montant que la limite a repris s'y détache. */
  protected readonly verdict = computed(() => priceVerdict(this.chain()));
  protected readonly delta = computed(() => deltaLabel(this.chain()));
  protected readonly discount = computed(() => isDiscount(this.chain()));
  /** « figé à la commande » — la mention que le lot 3 exige, cf. {@link chain}. */
  protected readonly frozen = computed(() => this.chain().origin === 'frozen');

  /**
   * La limite, prise sur les tronçons plutôt que recalculée : la ligne en
   * pointillé qui traverse la cascade et la colonne de la limite doivent être à
   * la MÊME hauteur, sinon la lecture ment d'un pixel et on ne sait plus lequel
   * des deux croire.
   */
  protected readonly floorLeg = computed(() => this.legs().find((leg) => leg.kind === 'floor'));
}
