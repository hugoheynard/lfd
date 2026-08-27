import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  LOCALES,
  SOURCE_LOCALE,
  missingLocales,
  readLocalized,
  type Locale,
} from '@lfd/pim-contracts';

import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldToggleIconComponent,
  type FoldIconName,
  type FoldTableColumn,
} from 'fold-ng';

import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { LOCALE_NAMES } from '../../../shared/lang-switch/locale-names';
import { pointsOfSaleSelling, sellsContext } from '../../data/channels';
import { Router, RouterLink } from '@angular/router';

import { CategoryStore } from '../category-store';
import { PointOfSaleStore } from '../../points-of-sale/point-of-sale-store';
import type { Category } from '../catalogue-api';

/**
 * Catégories (= familles = gammes). Chaque catégorie porte les **défauts de
 * canaux** et les **taux de TVA** (à emporter / sur place) dont héritent ses
 * produits.
 *
 * La page ne fait plus que **lister**. Créer, régler — nom, canaux, taux — et
 * archiver passent tous par le MÊME side-panel : les trois points d'une ligne
 * l'ouvrent sur cette famille, le bouton d'en-tête l'ouvre vide. La page portait
 * en plus une carte « Ajouter » à deux champs, qui ne proposait ni canaux ni
 * taux : toute famille naissait incomplète, à finir dans un second écran.
 *
 * Les familles archivées sont **masquées par défaut** : ce sont des lignes
 * mortes, et elles poussaient les vivantes vers le bas. L'œil de l'en-tête les
 * rappelle, et ne s'affiche que s'il y en a — un interrupteur qui ne commande
 * rien n'a pas à occuper la barre.
 *
 * La colonne TVA a quitté le tableau. Elle affichait deux taux hérités qu'on ne
 * peut ni comparer ni trier utilement, et que le panneau montre en contexte,
 * avec le canal qui les justifie.
 *
 * La liste se lit directement depuis les stores : toute mutation, d'où qu'elle
 * vienne, s'y voit sans que la page ait à recharger quoi que ce soit.
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    // Un seul gabarit de pastilles pour la colonne ET la carte.
    NgTemplateOutlet,
    RouterLink,
    FoldPageLayoutComponent,
    FoldElementTitleComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    LangSwitch,
    FoldToggleIconComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    // Sans elle, `foldRowCard` n'est qu'un attribut inerte : Angular ne s'en
    // plaint pas, le build reste vert, et la vue mobile rend le vide.
    FoldDataTableRowCardDirective,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly categoryStore = inject(CategoryStore);
  private readonly pointStore = inject(PointOfSaleStore);
  private readonly router = inject(Router);

  /** Lectures réactives : le panneau écrit dans les stores, la table suit. */
  protected readonly categories = this.categoryStore.items;
  /** Les archivées sont hors de vue tant qu'on ne les rappelle pas. */
  protected readonly showArchived = signal(false);
  /** Les noms affichés dans les pastilles viennent du référentiel. */
  protected readonly pointsOfSale = this.pointStore.items;

  /**
   * La langue dans laquelle le tableau LIT les noms. Une lecture, jamais une
   * saisie : on ne traduit pas depuis une ligne, on regarde ce qui est traduit.
   * Le nom n'est d'ailleurs que la colonne concernée — le parent en hérite, le
   * reste (fiches, canaux) n'est pas traduisible et ne bascule pas.
   */
  protected readonly lang = signal<Locale>(SOURCE_LOCALE);

  /**
   * Les langues incomplètes **quelque part** dans la liste affichée — l'union,
   * pas l'intersection : une seule famille non traduite en italien suffit à
   * marquer IT, sinon le point ne s'allumerait qu'une fois tout perdu.
   */
  protected readonly missingLangs = computed<readonly Locale[]>(() => {
    const seen = new Set<Locale>();
    for (const category of this.visible()) {
      for (const locale of missingLocales(category.name)) {
        seen.add(locale);
      }
    }
    return LOCALES.filter((locale) => seen.has(locale));
  });

  /** Combien de familles affichées manquent d'au moins une traduction. */
  protected readonly untranslated = computed(
    () => this.visible().filter((category) => missingLocales(category.name).length > 0).length,
  );

  /** Le nom d'une famille dans la langue lue — repli sur le français. */
  protected displayName(category: Category): string {
    return readLocalized(category.name, this.lang());
  }

  /**
   * Cette famille est-elle NON traduite dans la langue lue ?
   *
   * Le repli rend le français, donc une ligne traduite et une ligne non traduite
   * s'affichent pareil : sans marque, basculer le sélecteur donnerait un tableau
   * inchangé, et on conclurait que le sélecteur ne marche pas.
   */
  protected fallsBack(category: Category): boolean {
    return (category.name[this.lang()] ?? '') === '';
  }

  /** Le nom de la langue lue, pour la marque des lignes non traduites. */
  protected readonly langName = computed(() => LOCALE_NAMES[this.lang()]);

  /** La plateforme professionnelle vend-elle cette famille ? */
  protected sellsB2b(category: Category): boolean {
    return sellsContext(category.channelPreset, 'b2b');
  }

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom' },
    { key: 'parent', label: 'Parent' },
    { key: 'products', label: 'Fiches', width: '8rem' },
    { key: 'channels', label: 'Canaux par défaut' },
    { key: 'actions', label: '', align: 'right', width: '5rem' },
  ];

  protected readonly archivedCount = computed(
    () => this.categories().filter((category) => category.isArchived).length,
  );

  /** Les lignes réellement affichées. */
  protected readonly visible = computed(() =>
    this.showArchived()
      ? this.categories()
      : this.categories().filter((category) => !category.isArchived),
  );

  protected readonly eyeIcon = computed<FoldIconName>(() =>
    this.showArchived() ? 'eye' : 'eye-off',
  );
  protected readonly eyeTooltip = computed(() => {
    if (this.showArchived()) {
      return 'Masquer les familles archivées';
    }
    const count = this.archivedCount();
    return count === 1
      ? 'Afficher la famille archivée'
      : `Afficher les ${count} familles archivées`;
  });

  /**
   * Vide parce qu'il n'y en a pas, parce qu'on n'a pas pu lire, ou parce qu'on
   * les a toutes masquées ? Les trois se ressemblent à l'écran et n'appellent
   * pas du tout le même geste.
   */
  protected readonly emptyState = computed(() => {
    const failure = this.categoryStore.loadError();
    if (failure !== null) {
      return { title: 'Catégories illisibles', subtitle: failure };
    }
    if (this.archivedCount() > 0) {
      const count = this.archivedCount();
      return {
        title: 'Aucune famille active',
        subtitle:
          count === 1
            ? "Une famille archivée — l'œil la rappelle."
            : `${count} familles archivées — l'œil les rappelle.`,
      };
    }
    return { title: 'Aucune catégorie', subtitle: 'Commencez par « Viennoiseries ».' };
  });

  protected readonly rowKey = (category: Category): string => category.id;

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    const parent = this.categories().find((item) => item.id === category.parentId);
    return parent === undefined ? '—' : this.displayName(parent);
  }

  /** Le compte de fiches en TAG, jamais en blanc : une carte lit mal un vide. */
  protected ficheLabel(category: Category): string {
    const count = category.activeProductCount;
    return count === 0 ? 'Aucune fiche' : `${count} fiche(s)`;
  }

  protected presetEmporter(category: Category): string[] {
    return pointsOfSaleSelling(category.channelPreset, 'takeaway', this.pointsOfSale());
  }

  protected presetSurPlace(category: Category): string[] {
    return pointsOfSaleSelling(category.channelPreset, 'eatIn', this.pointsOfSale());
  }

  /**
   * Ouvre la famille — sur sa PAGE, plus dans un panneau.
   *
   * Appelée par `(rowClick)` de fold : la ligne entière est la commande, au
   * clavier comme à la souris. Le gabarit portait un `<button>` maison dans la
   * dernière colonne — une cible de la taille de trois points, quand la ligne
   * fait la largeur de l'écran.
   */
  protected open(category: Category): void {
    void this.router.navigate(['/pim/categories', category.id]);
  }
}
