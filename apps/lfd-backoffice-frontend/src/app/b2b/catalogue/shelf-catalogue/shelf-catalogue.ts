import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CatalogAdminItemView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import { htMillicentsOf, MILLICENTS_PER_CENT, ttcCentsFromHtMillicents } from '@lfd/money';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowNoteDirective,
  FoldPageSectionComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableRowNote,
  type FoldTableTone,
} from 'fold-ng';

import type { ShopAudience } from '../catalogue.service';
import { PublishedCell } from '../published-cell/published-cell';
import type { ReviewApproval } from '../review-callout/review-callout';
import { ReviewRowNote } from '../review-row-note/review-row-note';
import {
  audienceLabel,
  audienceOrigin,
  countsLabel,
  isInactive,
  pendingAudiences,
  rowName,
  type PublishedRow,
  type PublishedShelf,
} from '../published-catalogue';

/**
 * **Un rayon du catalogue vendu, en table.**
 *
 * Les colonnes se lisent de gauche à droite : l'article, son audience, **les
 * deux prix du référentiel** — le pro hors taxe et l'étiquette publique TTC —,
 * puis ce que chaque audience en voit.
 *
 * 🔴 **Plus aucun prix ne s'écrit ici** (lot D de
 * `plan-catalogue-synchronise-par-audience.md`, 2026-10-15). Les deux colonnes
 * « Prix pro HT » et « Prix public TTC », où l'on remplaçait le prix du
 * référentiel, sont parties avec leurs routes : la colonne des prix les lit,
 * et envoie à la fiche pour les changer.
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
 * **La validation d'une arrivée se fait sous sa ligne** (Hugo, 2026-10-17) :
 * une note `foldRowNote` porte les boutons utiles. L'encart de tête ne garde
 * que le compte et « Tout valider ».
 *
 * Ce composant ne décide rien : il rend le rayon et remonte les gestes.
 */
@Component({
  selector: 'app-shelf-catalogue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDataTableRowNoteDirective,
    FoldPageSectionComponent,
    PublishedCell,
    ReviewRowNote,
    RouterLink,
  ],
  templateUrl: './shelf-catalogue.html',
  styleUrl: './shelf-catalogue.scss',
})
export class ShelfCatalogue {
  readonly shelf = input.required<PublishedShelf>();

  /** L'interrupteur d'une cellule d'audience — la route unique `/masking`. */
  readonly maskToggled = output<{ row: PublishedRow; audience: ShopAudience }>();

  /** Une validation est en vol : les boutons des notes attendent. */
  readonly busy = input(false);

  /** La validation d'une ligne, pour les audiences choisies. */
  readonly approve = output<ReviewApproval>();

  protected readonly pendingOf = pendingAudiences;

  /** Seule une ligne en attente porte une note — les autres n'émettent aucun `<tr>`. */
  protected readonly hasNote: FoldTableRowNote<PublishedRow> = (row) =>
    pendingAudiences(row).length > 0;

  protected approveRow(row: PublishedRow, audiences: readonly ShopAudience[]): void {
    this.approve.emit({ skus: [row.variant.sku], audiences });
  }

  protected readonly euros = formatEuros;
  protected readonly name = rowName;
  protected readonly inactive = isInactive;

  protected readonly proCounts = computed(() => countsLabel(this.shelf().pro));
  protected readonly publicCounts = computed(() => countsLabel(this.shelf().public));

  /**
   * Les colonnes. Aucune n'est `sortable` : l'ordre du catalogue est celui du
   * référentiel — famille, puis position dans la famille —, et trier par prix
   * ferait perdre le seul repère qu'un lecteur ait pour retrouver un article
   * deux minutes plus tard.
   */
  protected readonly columns: readonly FoldTableColumn<PublishedRow>[] = [
    { key: 'article', label: 'Article' },
    // L'audience du RÉFÉRENTIEL — ce qu'il vend, avant tout masquage d'ici.
    { key: 'audience', label: 'Audience', width: '8rem' },
    // 🔴 **Deux lignes, et deux UNITÉS** (Hugo, 2026-09-21). Le référentiel
    // envoie les deux prix ; n'en montrer qu'un faisait passer le tarif du
    // canal professionnel pour « le » tarif du PIM.
    //
    // ⚠️ Pas `numeric` : un alignement à droite oppose des nombres
    // comparables, et un HT pro n'est pas comparable à un TTC public.
    { key: 'pim', label: 'Prix du référentiel', width: '13rem' },
    // Assez larges pour tenir la confirmation qui s'y ouvre. À `9rem`, la
    // phrase qui dit ce que « Masquer » va faire tombait sur cinq lignes.
    { key: 'pros', label: 'Pros', width: '13rem' },
    { key: 'audiencePublic', label: 'Public', width: '13rem' },
  ];

  protected readonly empty: FoldTableEmpty = {
    title: 'Aucun article dans ce rayon',
    subtitle: 'Aucune fiche de cette famille ne répond au filtre.',
  };

  protected readonly rowKey = (row: PublishedRow): string => row.variant.sku;

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
  protected readonly rowTone = (row: PublishedRow): FoldTableTone =>
    row.item?.vatRatePercent === null ? 'warning' : null;

  protected audience(row: PublishedRow): string {
    return audienceLabel(row.entry.audience);
  }

  protected origin(row: PublishedRow): string | null {
    return audienceOrigin(row.entry.audienceInherited);
  }

  /** Le prix pro servi (ou proposé), en euros HT — `null` sans prix. */
  protected proPrice(row: PublishedRow): string | null {
    const ht = row.variant.pro.htMillicents;
    return ht === null ? null : `${formatEuros(ht)} HT`;
  }

  /** L'étiquette publique servie (ou proposée), en euros TTC — `null` sans étiquette. */
  protected publicPrice(row: PublishedRow): string | null {
    const ttc = row.variant.public.ttcCents;
    return ttc === null ? null : `${formatEuros(ttc * MILLICENTS_PER_CENT)} TTC`;
  }

  /**
   * **Ce que le rayon public affichera vraiment**, en euros TTC.
   *
   * L'étiquette est une ENTRÉE : elle est mise hors taxe, traverse la
   * résolution, puis le rayon public la rend par `ttcCentsFromHtMillicents`
   * — la chaîne de la vignette d'un particulier depuis le lot C3 du plan
   * `documentation/pricing/plan-centime-particuliers.md` (§ 4). Elle revient
   * sur la valeur saisie ; l'écart d'un centime que cette colonne montrait
   * (HT de ligne arrondi d'abord, Hugo, 2026-09-21) reste celui du pro, qui
   * n'est pas affiché ici. La colonne reste : elle dit ce que la chaîne réelle
   * rend, et c'est elle qui verrait un écart revenir.
   */
  protected chargedEuros(item: CatalogAdminItemView): string | null {
    const posed = item.publicTtcCents;
    const rate = item.publicVatRatePercent;
    if (posed === null || rate === null) {
      return null;
    }
    const ht = htMillicentsOf(posed, rate);
    if (ht === null) {
      return null;
    }
    return formatEuros(ttcCentsFromHtMillicents(ht, rate) * MILLICENTS_PER_CENT);
  }

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
}
