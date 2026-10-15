import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogAdminItemView, PublishedCatalogView } from '@lfd/contracts';
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

import { NotifyService } from '../../../notify.service';
import { CatalogueService, type ShopAudience } from '../catalogue.service';
import {
  filterLabel,
  keptBy,
  matches,
  normalize,
  PUBLISHED_FILTERS,
  rowName,
  rowsOf,
  shelvesOf,
  type PublishedFilter,
  type PublishedRow,
  type PublishedShelf,
} from '../published-catalogue';
import { ReviewCallout, type ReviewApproval } from '../review-callout/review-callout';
import { ShelfCatalogue } from '../shelf-catalogue/shelf-catalogue';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Catalogue publié** — ce que le référentiel a envoyé, ce que chaque audience
 * en voit, et à quel prix (lot 3 de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`, H6 et H9 ;
 * D7 de `plan-audience-par-heritage.md`).
 *
 * Elle s'appelait « Catalogue actuel en ligne » et ne montrait que les
 * articles en vente. Elle part désormais des FICHES reçues (`GET
 * admin/catalog/published`) : une fiche inactive ou incomplète y paraît, parce
 * que c'est tout l'objet du lot — voir le catalogue se construire. Les
 * décisions de prix restent lues du paramétrage (`GET admin/catalog`) et
 * jointes par SKU : seule une ligne en vente en porte.
 *
 * Elle a quitté l'espace E-commerce pour **Gestion Boutique** (H9),
 * `/catalogue-publie` ; `/b2b/catalogue` y redirige.
 *
 * ⚠️ Ce qui suit est l'historique de l'écran d'avant, gardé parce que ses
 * colonnes de prix sont gardées.
 *
 * 🔴 **Le prix qu'on pose ici est celui du canal PROFESSIONNEL**, et l'écran le
 * dit depuis le 2026-09-21. Il s'appelait « prix B2B », ce qui était vrai tant
 * que la plateforme n'avait qu'une audience ; elle en a deux, et la vitrine
 * publique ne lit jamais ce nombre — elle sert l'étiquette reçue du
 * référentiel. Un nom qui désigne la plateforme là où il désigne un canal fait
 * croire qu'un prix posé ici vaut pour tout ce qu'elle vend.
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
    ReviewCallout,
    ShelfCatalogue,
  ],
  templateUrl: './catalogue-page.html',
  styleUrl: './catalogue-page.scss',
})
export class CataloguePage {
  private readonly catalogue = inject(CatalogueService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<PublishedCatalogView>({
    shelves: [],
    entries: [],
    pendingReview: [],
  });
  private readonly items = signal<readonly CatalogAdminItemView[]>([]);

  /** Une validation est en vol : les boutons du callout attendent. */
  protected readonly approving = signal(false);

  /**
   * Le filtre de recherche. Quarante lignes ne se parcourent pas à l'œil : sans
   * lui, corriger un prix demande de faire défiler cinq rayons.
   */
  protected readonly query = signal('');

  /** La lecture choisie — `all` par défaut. */
  protected readonly filter = signal<PublishedFilter>('all');

  /** Une ligne par déclinaison reçue, avec ses décisions de prix si elle est en vente. */
  private readonly rows = computed(() => rowsOf(this.view(), this.items()));

  protected readonly pending = computed(() => this.view().pendingReview);

  /** Combien d'articles EN VENTE n'ont pas de taux de TVA — le chiffre à voir. */
  protected readonly untaxedCount = computed(
    () => this.items().filter((item) => item.vatRatePercent === null).length,
  );

  protected readonly total = computed(() => this.rows().length);

  /**
   * Les lectures, avec leur compte. Un segment vide reste **affiché et
   * cliquable** : « 0 en attente » est exactement le genre de zéro qu'on a
   * besoin de voir, et un contrôle dont les segments apparaissent et
   * disparaissent ne se mémorise pas.
   */
  protected readonly filters = computed<readonly FoldViewToggleOption[]>(() =>
    PUBLISHED_FILTERS.map((value) => ({
      value,
      label: `${filterLabel(value)} (${String(this.rows().filter((row) => keptBy(row, value)).length)})`,
    })),
  );

  private readonly matching = computed(() => {
    const needle = normalize(this.query());
    const filter = this.filter();
    return this.rows().filter((row) => matches(row, needle) && keptBy(row, filter));
  });

  protected readonly shown = computed(() => this.matching().length);

  /**
   * Rangé par famille, dans l'ordre du serveur : le tri lui appartient, le
   * refaire ici donnerait deux ordres possibles pour un même catalogue.
   */
  protected readonly shelves = computed<readonly PublishedShelf[]>(() =>
    shelvesOf(this.view(), this.matching()),
  );

  /** La valeur rendue par `fold-view-toggle` est une `string` : on la ramène au filtre. */
  protected selectFilter(value: string): void {
    const known = PUBLISHED_FILTERS.find((filter) => filter === value);
    if (known !== undefined) {
      this.filter.set(known);
    }
  }

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [view, items] = await Promise.all([this.catalogue.published(), this.catalogue.list()]);
      this.view.set(view);
      this.items.set(items);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * **Masquer pour une audience, ou y remettre** — la route unique `/masking`.
   * Le sens se lit dans l'état de la cellule : seul `en_vente` et `masque`
   * offrent le geste.
   */
  protected async toggleMasking(change: {
    row: PublishedRow;
    audience: ShopAudience;
  }): Promise<void> {
    const { row, audience } = change;
    const hidden = row.variant[audience].state === 'en_vente';
    const name = rowName(row);
    const shop = audience === 'pro' ? 'la boutique professionnelle' : 'la boutique publique';
    try {
      await this.catalogue.setMasking(row.variant.sku, audience, hidden);
      this.notify.success(
        hidden ? `${name} est masqué de ${shop}.` : `${name} revient dans ${shop}.`,
      );
      await this.load();
    } catch (error) {
      this.notify.error(error, "L'affichage n'a pas pu être changé.");
    }
  }

  /** Lève l'attente de validation, puis relit : le serveur reste l'autorité. */
  protected async approve(approval: ReviewApproval): Promise<void> {
    this.approving.set(true);
    try {
      await this.catalogue.approveReview(approval.skus, approval.audiences);
      this.notify.success(
        approval.skus.length > 1
          ? `${String(approval.skus.length)} articles validés.`
          : 'Article validé.',
      );
      await this.load();
    } catch (error) {
      this.notify.error(error, "La validation n'a pas pu être enregistrée.");
    } finally {
      this.approving.set(false);
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
}
