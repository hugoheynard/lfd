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
/**
 * ⚠️ La VALEUR reste `'b2b'` — c'est une clé de segment, pas un libellé, et le
 * lexique du dépôt distingue les deux (CLAUDE.md § 8, troisième exception).
 * Seul le mot affiché devient « pro ».
 */
const WITH_PRO_PRICE = 'b2b';
const FEATURED = 'featured';
const UNTAXED = 'untaxed';
const HIDDEN = 'hidden';

/**
 * **Catalogue actuel en ligne** — ce que la plateforme vend, et à quel prix.
 *
 * 🔴 **Le prix qu'on pose ici est celui du canal PROFESSIONNEL**, et l'écran le
 * dit depuis le 2026-09-21. Il s'appelait « prix B2B », ce qui était vrai tant
 * que la plateforme n'avait qu'une audience ; elle en a deux, et la vitrine
 * publique ne lit jamais ce nombre — elle sert l'étiquette reçue du
 * référentiel. Un nom qui désigne la plateforme là où il désigne un canal fait
 * croire qu'un prix posé ici vaut pour tout ce qu'elle vend.
 *
 * ⚠️ **Cette vue ne montre donc qu'une moitié de la réalité** (Hugo,
 * 2026-09-21). Il lui manque la colonne du prix public, et son bouton
 * « Masquer » retire des DEUX boutiques à la fois — cf.
 * `documentation/pim/plan-un-seul-canal-deux-prix.md`, D11.
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
 * la même cellule. Personne n'a jamais posé un prix pro depuis cet écran, et le
 * compteur « 0 à prix pro » l'annonçait sans que personne ne fasse le lien.
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

  /**
   * Combien sont masqués **d'au moins une** des deux boutiques.
   *
   * ⚠️ **Un mot pour deux drapeaux**, et c'est un choix : le segment sert à
   * retrouver ce qui ne se vend pas quelque part, pas à distinguer où. Compter
   * les deux séparément donnerait deux segments pour une question qu'on se pose
   * rarement, et la ligne, elle, dit laquelle des deux (2026-09-21).
   */
  protected readonly hiddenCount = computed(
    () => this.items().filter((item) => item.isHidden || item.isHiddenPublic).length,
  );

  /**
   * Combien passent devant les autres dans la boutique.
   *
   * ⚠️ **Le compte reste, le CONTRÔLE est parti** (Hugo, 2026-09-21 : « on
   * enlève aussi la colonne mise en avant, ça sera ailleurs »). Le segment est
   * donc une LECTURE seule, et c'est volontaire : tant que l'écran qui la
   * réglera n'existe pas, retirer aussi le compte laisserait un état de la
   * boutique que plus rien ne montre. On voit ce qui est en avant ; on le règle
   * ailleurs, bientôt.
   */
  protected readonly featuredCount = computed(
    () => this.items().filter((item) => item.isFeatured).length,
  );

  protected readonly total = computed(() => this.items().length);

  /**
   * Les segments, avec leur compte.
   *
   * Un segment vide reste **affiché et cliquable** plutôt que masqué : « 0 à
   * prix pro » est exactement le genre de zéro qu'on a besoin de voir, et un
   * contrôle dont les segments apparaissent et disparaissent au fil des données
   * ne se mémorise pas.
   */
  protected readonly filters = computed<readonly FoldViewToggleOption[]>(() => [
    { value: ALL, label: `Tous (${String(this.total())})` },
    { value: WITH_PRO_PRICE, label: `À prix pro (${String(this.alteredCount())})` },
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

  /**
   * Masque de la vitrine **publique**, ou l'y remet.
   *
   * Geste distinct de son homologue professionnelle : ce sont deux décisions,
   * et le journal les raconte séparément.
   */
  protected async togglePublicVisibility(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.setPublicVisibility(item.sku, !item.isHiddenPublic);
      this.notify.success(
        item.isHiddenPublic
          ? `${item.name} revient en vitrine publique.`
          : `${item.name} est masqué de la vitrine publique.`,
      );
      await this.load();
    } catch (error) {
      this.notify.error(error, "La visibilité publique n'a pas pu être changée.");
    }
  }

  /**
   * Pose l'étiquette publique. Le serveur oppose trois refus — montant nul,
   * étiquette du PIM recopiée, article hors vitrine publique — et les trois se
   * comprennent en une lecture, d'où `refused` plutôt qu'`error`.
   */
  protected async setPublicPrice(change: {
    item: CatalogAdminItemView;
    ttcCents: number;
  }): Promise<void> {
    try {
      await this.catalogue.setPublicPrice(change.item.sku, change.ttcCents);
      this.notify.success(`Prix public posé sur ${change.item.name}.`);
      await this.load();
    } catch (error) {
      this.notify.refused(error, "Le prix public n'a pas pu être enregistré.");
    }
  }

  /** Retire l'étiquette publique décidée ici : l'article repasse à celle du PIM. */
  protected async alignPublicOnPim(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.alignPublicOnPim(item.sku);
      this.notify.success(`${item.name} repasse à l'étiquette du PIM.`);
      await this.load();
    } catch (error) {
      this.notify.error(error, "La décision n'a pas pu être retirée.");
    }
  }

  /** Pose le prix pro. Le serveur refuse un montant égal à celui du PIM. */
  protected async setPrice(change: {
    item: CatalogAdminItemView;
    priceMillicents: number;
  }): Promise<void> {
    try {
      await this.catalogue.setPrice(change.item.sku, change.priceMillicents);
      this.notify.success(`Prix pro posé sur ${change.item.name}.`);
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
    case WITH_PRO_PRICE:
      return item.b2bPriceMillicents !== null;
    case FEATURED:
      return item.isFeatured;
    case UNTAXED:
      return item.vatRatePercent === null;
    case HIDDEN:
      // D'au moins une des deux boutiques — le même critère que le compteur du
      // segment, sans quoi « Masqués (3) » en afficherait deux.
      return item.isHidden || item.isHiddenPublic;
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
