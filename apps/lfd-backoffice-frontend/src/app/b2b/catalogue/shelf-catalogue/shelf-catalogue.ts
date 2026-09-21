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
 * le référentiel a envoyé — **ses deux prix**, le pro hors taxe et l'étiquette
 * publique TTC —, ce que la maison en a décidé, puis ce qui conditionne la
 * vente.
 *
 * ⚠️ **Trois colonnes ont quitté cette table le 2026-09-21** (Hugo) : la fiche
 * réglementaire, la mise en avant et le taux de TVA. Aucune ne parle du prix
 * qu'on décide ici, et elles prenaient trente-sept `rem` au milieu de colonnes
 * qui, elles, se comparent d'une ligne à l'autre.
 *
 * 🔴 **Le taux part pour une raison de plus, et c'est la bonne** : il y en a
 * désormais DEUX — celui du canal professionnel et celui du contexte public —
 * et une colonne « TVA » au singulier montrait le premier en laissant croire
 * qu'il valait pour les deux. Ce qu'elle portait d'irremplaçable, l'aveu
 * « sans taux, donc invendable », a emménagé dans la colonne Article : la
 * teinte de ligne ne doit jamais rester seule à dire quelque chose.
 *
 * Les allergènes et le taux restent au contrat : c'est l'écran qui ne les
 * montre plus, pas le serveur qui ne les envoie plus.
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
 * 🔴 **C'est là que le prix pro se perdait.** « Poser un prix » était le
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
   * `Prix pro` est la plus large de toutes, et c'est délibéré : c'est la seule
   * colonne où l'on **écrit**, et elle doit tenir un champ ouvert sans faire
   * sauter la mise en page des voisines.
   */
  protected readonly columns: readonly FoldTableColumn<CatalogAdminItemView>[] = [
    { key: 'article', label: 'Article' },
    // 🔴 **Deux lignes, et deux UNITÉS** (Hugo, 2026-09-21). Le référentiel
    // envoie les deux prix ; n'en montrer qu'un faisait passer le tarif du
    // canal professionnel pour « le » tarif du PIM.
    //
    // ⚠️ Plus `numeric` : un alignement à droite oppose des nombres
    // comparables, et un HT pro n'est pas comparable à un TTC public. Les
    // mettre en colonne d'un même chiffrier inviterait à en faire la
    // différence, qui ne veut rien dire.
    { key: 'pim', label: 'Tarif PIM', width: '11rem' },
    // ⚠️ La CLÉ reste `b2b` : elle relie la colonne à son `ng-template`, et
    // c'est du code, pas un libellé. Seul le mot affiché devient « pro ».
    { key: 'b2b', label: 'Prix pro HT', width: '15rem' },
    // Assez large pour tenir la confirmation qui s'y ouvre. À `9rem`, la
    // phrase qui dit ce que « Masquer » va faire tombait sur cinq lignes.
    { key: 'shop', label: 'Boutique', width: '18rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle:
      'Publiez des produits de cette famille sur le canal professionnel, puis lancez un push.',
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
   * **L'étiquette publique, en euros TTC** — ou `null` quand le référentiel n'en
   * a pas poussé.
   *
   * Les centimes passent par le même formateur que les millicentimes, en les y
   * ramenant : deux chemins de mise en forme pour deux unités finiraient par
   * arrondir différemment, et sur la même ligne.
   */
  protected publicEuros(item: CatalogAdminItemView): string | null {
    const cents = item.publicTtcCents;
    return cents === null ? null : formatEuros(cents * MILLICENTS_PER_CENT);
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

/** Un centime vaut mille millicentimes — `@lfd/money`, la seule conversion d'ici. */
const MILLICENTS_PER_CENT = 1_000;
