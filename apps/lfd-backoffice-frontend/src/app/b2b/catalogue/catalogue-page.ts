import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogAdminItemView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { CatalogueService } from './catalogue.service';
import { ShelfCatalogue, type CatalogueShelf } from './shelf-catalogue/shelf-catalogue';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Les quatre lectures du catalogue. Ce sont des **filtres**, et ils portent
 * leur compte : un chiffre qui ne fait rien se lit une fois puis s'ignore,
 * alors que le même chiffre sur un segment se clique.
 */
const ALL = 'all';
const WITH_B2B_PRICE = 'b2b';
const FEATURED = 'featured';
const UNTAXED = 'untaxed';
const HIDDEN = 'hidden';

/**
 * **Catalogue B2B** — ce que la plateforme vend, et à quel prix.
 *
 * L'écran montre ce que le référentiel a poussé — le **tarif du PIM** — et ce
 * que la maison en a fait. Le prix décidé ici n'est pas un étage de la
 * tarification : il **remplace le canonique**, avant que mercuriale, paliers,
 * promotions et gestes ne s'appliquent par-dessus. C'est le premier
 * remplacement, et le seul qui survive à tous les pushs suivants.
 *
 * Trois choses que l'écran doit dire, parce qu'elles décident de la suite :
 *
 * - **d'où vient chaque prix** — un tarif sans provenance ne se défend pas ;
 * - **comment en poser un** — voir la suite ;
 * - **quels articles ne sont pas vendables** — un article sans taux de TVA
 *   entre au catalogue mais reste hors boutique. Le taire donnerait une liste
 *   rassurante dont la moitié n'est achetable par personne.
 *
 * 🔴 **Le deuxième point a été FAUX du premier jour au 2026-09-10.** Le contrôle
 * existait, il répondait au clic, et il était peint en blanc sur la carte
 * blanche (cf. `PriceEditor`) — au milieu de quatre autres choses entassées dans
 * la même cellule. Personne n'a jamais posé un prix B2B depuis cet écran, et le
 * compteur « 0 à prix B2B » l'annonçait sans que personne ne fasse le lien.
 *
 * 🔴 **Ce compteur de non-vendables était aveugle jusqu'au 2026-09-06.** Le
 * serveur repliait sur le taux de la FAMILLE quand l'article n'en portait pas :
 * l'écran affichait donc un taux, et l'article n'était pas compté. La caisse
 * repliait pareil, si bien que les deux s'accordaient — sur un taux que
 * personne n'avait posé sur cet article. Les deux replis sont partis ensemble,
 * et ce chiffre dit enfin quelque chose.
 */
@Component({
  selector: 'app-catalogue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    ShelfCatalogue,
  ],
  templateUrl: './catalogue-page.html',
  styleUrl: './catalogue-page.scss',
})
export class CataloguePage {
  private readonly catalogue = inject(CatalogueService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  private readonly items = signal<readonly CatalogAdminItemView[]>([]);

  /**
   * Le filtre de recherche. Quarante lignes ne se parcourent pas à l'œil : sans
   * lui, corriger un prix demande de faire défiler cinq rayons.
   */
  protected readonly query = signal('');

  /** La lecture choisie — un des quatre segments, `all` par défaut. */
  protected readonly filter = signal<string>(ALL);

  /** Combien d'articles ne sont pas vendables faute de TVA — le chiffre à voir. */
  protected readonly untaxedCount = computed(
    () => this.items().filter((item) => item.vatRatePercent === null).length,
  );

  /** Combien portent un prix décidé ici — la mesure du travail commercial déjà fait. */
  protected readonly alteredCount = computed(
    () => this.items().filter((item) => item.b2bPriceMillicents !== null).length,
  );

  protected readonly hiddenCount = computed(
    () => this.items().filter((item) => item.isHidden).length,
  );

  /** Combien passent devant les autres dans la boutique. */
  protected readonly featuredCount = computed(
    () => this.items().filter((item) => item.isFeatured).length,
  );

  protected readonly total = computed(() => this.items().length);

  /**
   * Les segments, avec leur compte.
   *
   * Un segment vide reste **affiché et cliquable** plutôt que masqué : « 0 à
   * prix B2B » est exactement le genre de zéro qu'on a besoin de voir, et un
   * contrôle dont les segments apparaissent et disparaissent au fil des données
   * ne se mémorise pas.
   */
  protected readonly filters = computed<readonly FoldViewToggleOption[]>(() => [
    { value: ALL, label: `Tous (${String(this.total())})` },
    { value: WITH_B2B_PRICE, label: `À prix B2B (${String(this.alteredCount())})` },
    { value: FEATURED, label: `En avant (${String(this.featuredCount())})` },
    { value: UNTAXED, label: `Sans TVA (${String(this.untaxedCount())})` },
    { value: HIDDEN, label: `Masqués (${String(this.hiddenCount())})` },
  ]);

  /** Nom ou référence, sans accent ni casse — on tape « pate » et « Pâté » sort. */
  private readonly matching = computed(() => {
    const needle = normalize(this.query());
    const filter = this.filter();
    return this.items().filter((item) => named(item, needle) && kept(item, filter));
  });

  protected readonly shown = computed(() => this.matching().length);

  /**
   * Rangé par famille, dans l'ordre du serveur.
   *
   * Le tri appartient au backend (position de la famille, puis de l'article) :
   * le refaire ici donnerait deux ordres possibles pour un même catalogue, et
   * c'est celui qu'on ne regarde pas qui finirait par diverger.
   */
  protected readonly shelves = computed<readonly CatalogueShelf[]>(() => {
    const byId = new Map<string, CatalogAdminItemView[]>();
    for (const item of this.matching()) {
      const shelf = byId.get(item.categoryId);
      if (shelf === undefined) {
        byId.set(item.categoryId, [item]);
      } else {
        shelf.push(item);
      }
    }
    return [...byId.entries()].map(([id, items]) => ({
      id,
      name: items[0]?.categoryName ?? id,
      items,
      untaxed: items.every((item) => item.vatRatePercent === null),
    }));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.items.set(await this.catalogue.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Pose le prix B2B. Le serveur refuse un montant égal à celui du PIM. */
  protected async setPrice(change: {
    item: CatalogAdminItemView;
    priceMillicents: number;
  }): Promise<void> {
    try {
      await this.catalogue.setPrice(change.item.sku, change.priceMillicents);
      this.notify.success(`Prix B2B posé sur ${change.item.name}.`);
      await this.load();
    } catch (error) {
      // `refused` et non `error` : le refus le plus fréquent est « ce prix est
      // celui du PIM », une règle qui se comprend en une lecture et dont le
      // toast n'a pas à rester à l'écran.
      this.notify.refused(error, "Le prix n'a pas pu être enregistré.");
    }
  }

  /** Retire la décision : l'article repasse au tarif du PIM et suivra ses hausses. */
  protected async alignOnPim(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.alignOnPim(item.sku);
      this.notify.success(`${item.name} suit de nouveau le tarif du PIM.`);
      await this.load();
    } catch (error) {
      this.notify.error(error, "La décision n'a pas pu être retirée.");
    }
  }

  /**
   * **Met en avant, ou retire la mise en avant.**
   *
   * Pas de confirmation : rien n'est retiré de la vente, et le second clic
   * défait le premier. Le refus possible reste celui du serveur — un article
   * masqué —, et l'écran l'a déjà désamorcé en éteignant le bouton.
   */
  protected async toggleFeatured(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.setFeatured(item.sku, !item.isFeatured);
      this.notify.success(
        item.isFeatured
          ? `${item.name} n'est plus mis en avant.`
          : `${item.name} passe en avant dans la boutique.`,
      );
      await this.load();
    } catch (error) {
      // `refused` : le seul échec attendu est « l'article est masqué », une
      // règle qui se comprend en une lecture.
      this.notify.refused(error, "La mise en avant n'a pas pu être changée.");
    }
  }

  /** Masque ou réaffiche un article, puis recharge : le serveur reste l'autorité. */
  protected async toggleVisibility(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.setVisibility(item.sku, !item.isHidden);
      this.notify.success(
        item.isHidden
          ? `${item.name} est de nouveau commandable.`
          : `${item.name} n'est plus commandable dans la boutique.`,
      );
      await this.load();
    } catch (error) {
      this.notify.error(error, "L'article n'a pas pu être modifié.");
    }
  }
}

/**
 * L'article répond-il au terme cherché ? Un terme vide laisse tout passer.
 *
 * Le SKU compte autant que le nom : c'est la référence qu'un bon de commande
 * porte, donc celle qu'on recopie depuis un autre écran.
 */
function named(item: CatalogAdminItemView, needle: string): boolean {
  return (
    needle === '' || normalize(item.name).includes(needle) || normalize(item.sku).includes(needle)
  );
}

/** L'article entre-t-il dans la lecture choisie ? `all` garde tout. */
function kept(item: CatalogAdminItemView, filter: string): boolean {
  switch (filter) {
    case WITH_B2B_PRICE:
      return item.b2bPriceMillicents !== null;
    case FEATURED:
      return item.isFeatured;
    case UNTAXED:
      return item.vatRatePercent === null;
    case HIDDEN:
      return item.isHidden;
    default:
      return true;
  }
}

/** Sans accent ni casse : on tape « pate » et « Pâté » sort. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}
