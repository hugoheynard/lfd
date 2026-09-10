import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CatalogAdminItemView } from '@lfd/contracts';
import { formatEuros, PriceEditor, PriceOrigin } from '@lfd/catalog-ui';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';

/** Un rayon : la famille et ses articles, dans l'ordre reçu du PIM. */
export interface CatalogueShelf {
  readonly id: string;
  readonly name: string;
  readonly items: readonly CatalogAdminItemView[];
  /** Aucun article du rayon n'a de taux de TVA : rien n'y est vendable. */
  readonly untaxed: boolean;
}

/**
 * **Un rayon du catalogue vendu, en table.**
 *
 * Les colonnes se lisent de gauche à droite comme le prix se construit : ce que
 * le référentiel a envoyé, ce que la maison en a décidé, puis ce qui conditionne
 * la vente — le taux, la fiche, la vitrine.
 *
 * ## Pourquoi une table, et pas la ligne d'avant
 *
 * L'écran empilait des `lfd-catalog-row` : une grille de quatre colonnes dont la
 * dernière recevait **tout le reste** dans une boîte flex — le taux, les
 * allergènes, l'éditeur de prix, la pastille « masqué » et le bouton de
 * visibilité. Cinq choses sans rapport, dans une seule cellule, sans alignement
 * d'une ligne à l'autre. Sur quarante articles, rien ne se compare en colonne,
 * et le seul élément qui ressortait était le bouton le plus criard.
 *
 * 🔴 **C'est là que le prix B2B se perdait.** « Poser un prix » était le
 * quatrième enfant d'une boîte qui en portait cinq, écrit en blanc sur blanc
 * (cf. `PriceEditor`). Lui donner sa **propre colonne**, à côté du tarif reçu
 * qu'il remplace, est la moitié de la réparation ; l'autre moitié est la
 * couleur. Aucune des deux ne suffisait seule.
 *
 * Ce composant ne décide rien : il rend le rayon et remonte les gestes.
 */
@Component({
  selector: 'app-shelf-catalogue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
    PriceEditor,
    PriceOrigin,
  ],
  templateUrl: './shelf-catalogue.html',
  styleUrl: './shelf-catalogue.scss',
})
export class ShelfCatalogue {
  readonly shelf = input.required<CatalogueShelf>();

  readonly priceSet = output<{ item: CatalogAdminItemView; priceMillicents: number }>();
  readonly priceAligned = output<CatalogAdminItemView>();
  readonly visibilityToggled = output<CatalogAdminItemView>();

  protected readonly euros = formatEuros;

  protected readonly items = computed<readonly CatalogAdminItemView[]>(() => this.shelf().items);

  /**
   * Les colonnes. Aucune n'est `sortable` : l'ordre du catalogue est celui du
   * référentiel — famille, puis position dans la famille —, et trier par prix
   * ferait perdre le seul repère qu'un lecteur ait pour retrouver un article
   * deux minutes plus tard.
   *
   * `Prix B2B` est la plus large de toutes, et c'est délibéré : c'est la seule
   * colonne où l'on **écrit**, et elle doit tenir un champ ouvert sans faire
   * sauter la mise en page des voisines.
   */
  protected readonly columns: readonly FoldTableColumn<CatalogAdminItemView>[] = [
    { key: 'article', label: 'Article' },
    { key: 'pim', label: 'Tarif PIM', width: '8rem', numeric: true },
    { key: 'b2b', label: 'Prix B2B', width: '15rem' },
    { key: 'vat', label: 'TVA', width: '6rem', numeric: true },
    { key: 'sheet', label: 'Fiche', width: '13rem' },
    // Assez large pour tenir la confirmation qui s'y ouvre. À `9rem`, la
    // phrase qui dit ce que « Masquer » va faire tombait sur cinq lignes.
    { key: 'shop', label: 'Boutique', width: '17rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle: 'Publiez des produits de cette famille sur le canal B2B, puis lancez un push.',
  };

  protected readonly rowKey = (item: CatalogAdminItemView): string => item.sku;

  /**
   * **Le ton de ligne dit ce qui empêche de VENDRE**, rien d'autre.
   *
   * Un article sans taux de TVA entre au catalogue et n'est achetable par
   * personne : c'est le seul état de cet écran qui appelle un geste, et il
   * appelle un geste dans le PIM. Un article masqué, lui, est une décision — le
   * teinter dirait qu'il y a quelque chose à réparer.
   *
   * Le fait est **écrit** dans la cellule du taux, donc la couleur ne le porte
   * jamais seule.
   */
  protected readonly rowTone = (item: CatalogAdminItemView): FoldTableTone =>
    item.vatRatePercent === null ? 'warning' : null;

  /**
   * Les allergènes d'un article, en une ligne : « Gluten · Lait ».
   *
   * Ce sont les catégories INCO — les mots d'une étiquette —, pas les codes GS1
   * du stockage. Le serveur a fait la projection ; l'écran ne fait que les
   * joindre.
   */
  protected allergenLabels(item: CatalogAdminItemView): string {
    return (item.allergens ?? []).map((allergen) => allergen.label).join(' · ');
  }

  /**
   * **Quand la décision a été prise**, en jour et mois courts.
   *
   * Sans année : un prix négocié se relit dans la semaine, et l'année n'ajoute
   * rien à la question qu'on se pose devant la colonne — « est-ce que ça date
   * d'avant la dernière hausse ? ». `null` quand rien n'a été décidé.
   */
  protected decidedOn(item: CatalogAdminItemView): string | null {
    const decidedAt = item.decidedAt;
    return decidedAt === null
      ? null
      : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
          new Date(decidedAt),
        );
  }
}
