import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatEuros } from '@lfd/catalog-ui';
import type { PriceRuleView, PricingCategoryView, PricingItemView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPageSectionComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';

import { FinalPrice } from '../final-price/final-price';
import { RuleChip } from '../rule-chip/rule-chip';
import { VolumeEffort } from '../volume-effort/volume-effort';
import { floorLabel, roomEuros, roomPercent } from '../pricing-format';

/**
 * **Un rayon, en table.**
 *
 * Les colonnes se lisent de GAUCHE à DROITE, comme le prix se construit :
 * l'article et son tarif, la limite qui le protège, l'altération qui le vise, le
 * prix qui en sort — puis deux colonnes qui ne construisent plus le prix mais le
 * **commentent**, le négoce restant et l'effort de volume.
 *
 * **Une `fold-data-table`, et non une grille maison.** L'écran dessinait sept
 * colonnes en `display:grid`, chaque cellule en carte flottante reliée à sa
 * voisine par un trait et un chevron. Sur quatre-vingt-douze articles cela fait
 * six cent quarante-quatre cartes, chacune avec sa gouttière, son ombre et son
 * rayon — et la relation entre colonnes, qui était le motif du dessin, était
 * portée par des pseudo-éléments à recalculer à chaque point de rupture. La
 * table la porte par l'alignement, qui ne se désaligne pas, et fold apporte au
 * passage l'en-tête collant, le survol de ligne, le premier `<th scope="row">`
 * et la bascule en cartes sur petit écran.
 *
 * **L'altération de famille est dans l'EN-TÊTE, pas dans une colonne.** C'est ce
 * que la table a forcé à trancher, et le résultat est plus juste : une règle de
 * famille est **une** décision pour tout le rayon, pas une valeur par ligne.
 * Elle vivait dans une cellule fusionnée sur toute la hauteur — une forme qui
 * disait déjà « il n'y en a qu'une », au prix d'une colonne que rien ne
 * remplissait jamais. Dans l'en-tête, à côté de la limite de famille, les deux
 * décisions de rayon sont voisines et se lisent ensemble.
 *
 * Ce composant ne décide rien : il rend ce que la vue du rayon porte et remonte
 * les gestes. Les panneaux d'écriture appartiennent à la page.
 */
@Component({
  selector: 'app-shelf-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldPageSectionComponent,
    FinalPrice,
    RuleChip,
    VolumeEffort,
  ],
  templateUrl: './shelf-table.html',
  styleUrl: './shelf-table.scss',
})
export class ShelfTable {
  readonly category = input.required<PricingCategoryView>();
  /** L'article dont le chemin du prix est déplié en haut de l'écran. */
  readonly selectedSku = input<string | null>(null);

  readonly picked = output<PricingItemView>();
  readonly categoryFloorRequested = output<PricingCategoryView>();
  readonly categoryRuleRequested = output<PricingCategoryView>();
  readonly itemFloorRequested = output<PricingItemView>();
  readonly itemRuleRequested = output<PricingItemView>();
  readonly ruleToggled = output<PriceRuleView>();
  readonly ruleJournalRequested = output<PriceRuleView>();
  readonly ruleArchiveRequested = output<PriceRuleView>();

  protected readonly euros = formatEuros;
  protected readonly floorLabel = floorLabel;

  protected readonly items = computed<readonly PricingItemView[]>(() => this.category().items);

  /**
   * Les colonnes. Aucune n'est `sortable` : l'ordre du catalogue est celui du
   * rayon, et trier par prix ferait perdre le seul repère qu'un lecteur ait
   * pour retrouver un article deux minutes plus tard.
   */
  protected readonly columns: readonly FoldTableColumn<PricingItemView>[] = [
    { key: 'article', label: 'Article · tarif' },
    { key: 'limit', label: 'Limite', width: '8rem' },
    { key: 'product', label: 'Altération produit', width: '12rem' },
    { key: 'final', label: 'Prix final', width: '11rem' },
    { key: 'room', label: 'Négoce', width: '9rem' },
    { key: 'effort', label: 'Effort de volume', width: '12rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle: 'Publiez des produits de cette famille sur le canal B2B.',
  };

  protected readonly rowKey = (item: PricingItemView): string => item.sku;

  /**
   * **Le ton de ligne dit l'ÉTAT du prix**, jamais la sélection.
   *
   * Une ligne en ambre est une ligne où la limite a relevé le prix, donc où une
   * règle n'a pas produit son effet. C'est le seul chiffre de cet écran qui
   * appelle un geste aujourd'hui, et le bandeau de tête le compte — la teinte
   * est ce qui permet de le retrouver dans quatre-vingt-douze lignes.
   *
   * `alert` passe devant `warning` : un prix ramené à zéro, c'est la boutique
   * qui donne la marchandise. Les deux faits sont **écrits** dans la cellule du
   * prix final, donc la couleur ne les porte jamais seule.
   *
   * La sélection se marque ailleurs, dans la cellule de l'article et en teinte
   * de marque. Les faire partager ce canal donnait à une ligne simplement
   * choisie l'exacte apparence d'une ligne en défaut.
   */
  protected readonly rowTone = (item: PricingItemView): FoldTableTone =>
    item.clampedToZero ? 'alert' : item.floored ? 'warning' : null;

  protected roomEuros(maxDiscountMillicents: number): string {
    return roomEuros(maxDiscountMillicents);
  }

  protected roomPercent(maxDiscountBp: number): string {
    return roomPercent(maxDiscountBp);
  }

  /** La limite de l'article vient-elle d'ailleurs ? Poser la sienne fait sauter celle-là. */
  protected isInherited(item: PricingItemView): boolean {
    return item.ownFloor === null && item.effectiveFloor !== null;
  }

  /**
   * Une règle de famille qu'une règle d'article évince, dans le même étage.
   *
   * Jugée sur **tout le rayon** et non ligne par ligne, parce que le nœud est
   * unique : il ne peut pas être barré pour un article et pas pour son voisin.
   * D'où le libellé « supplantée sur certains articles », qui dit la nuance que
   * le barré seul ferait perdre.
   */
  protected isSuperseded(rule: PriceRuleView): boolean {
    return this.items().some((item) => item.supersededRuleIds.includes(rule.id));
  }
}
