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
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, H6 et H9 ;
 * §7 de `catalogue-synchronise.md`).
 *
 * Elle s'appelait « Catalogue actuel en ligne » et ne montrait que les
 * articles en vente. Elle part désormais des FICHES reçues (`GET
 * admin/catalog/published`) : une fiche inactive ou incomplète y paraît, parce
 * que c'est tout l'objet du lot — voir le catalogue se construire. Le
 * paramétrage (`GET admin/catalog`) est joint par SKU : seule une ligne en
 * vente en porte.
 *
 * 🔴 **Les prix s'y lisent, ils ne s'y posent plus** (lot D, 2026-10-15) :
 * le prix servi est celui du référentiel, et la ligne envoie à la fiche pour
 * le changer.
 *
 * Elle a quitté l'espace E-commerce pour **Gestion Boutique** (H9),
 * `/catalogue-publie` ; `/b2b/catalogue` y redirige.
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
   * lui, retrouver un article demande de faire défiler cinq rayons.
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
}
