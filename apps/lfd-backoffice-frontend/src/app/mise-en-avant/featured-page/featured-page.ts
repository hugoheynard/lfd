import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { CatalogAdminItemView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
  FoldSelectComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService, type ShopAudience } from '../../b2b/catalogue/catalogue.service';
import { ShopCopyService } from '../../textes-boutique/data/shop-copy.service';
import { BADGE_COPY_KEY, badgeCopyOf, type BadgeCopy } from '../rules/badge-copy';
import {
  familiesOf,
  featuredCount,
  featuredRows,
  filterRows,
  type FeaturedCell,
  type FeaturedRow,
} from '../rules/featured-rows';

/** La valeur du filtre « toutes les familles » — une famille n'a jamais d'id vide. */
const ALL_FAMILIES = '';

/**
 * **Gestion Boutique › Mise en avant** (Hugo, 2026-10-18) — les
 * incontournables : quels articles la boutique marque, pour les pros et pour
 * les particuliers, chacun à part.
 *
 * Sous `lfc_catalog` — le droit que la route serveur oppose
 * (`@AdminSurface("lfc_catalog")`) et dont le libellé nomme déjà la mise en
 * avant ; basculer demande `:write`. Le libellé de la pastille, en tête, se
 * lit dans Textes de la boutique (sa seule source) et s'y modifie : la
 * publication y est globale, et publier d'ici publierait aussi les brouillons
 * des autres textes.
 */
@Component({
  selector: 'app-featured-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
    FoldSelectComponent,
    NgTemplateOutlet,
    RouterLink,
  ],
  templateUrl: './featured-page.html',
  styleUrl: './featured-page.scss',
})
export class FeaturedPage implements OnInit {
  private readonly catalogue = inject(CatalogueService);
  private readonly shopCopy = inject(ShopCopyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly items = signal<readonly CatalogAdminItemView[]>([]);
  protected readonly actionFailure = signal<string | null>(null);
  /** Les cases en cours d'envoi : `sku:audience`. */
  protected readonly pending = signal<ReadonlySet<string>>(new Set());
  protected readonly query = signal('');
  protected readonly familyId = signal(ALL_FAMILIES);
  protected readonly badge = signal<BadgeCopy | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_catalog:write'));
  /** Le libellé se lit sous le droit de Textes de la boutique, et seulement avec lui. */
  protected readonly canReadCopy = computed(() => this.permissions.can('b2b_storefront:read'));
  protected readonly allFamilies = ALL_FAMILIES;
  protected readonly badgeKey = BADGE_COPY_KEY;

  protected readonly rows = computed(() => featuredRows(this.items()));
  protected readonly families = computed(() => familiesOf(this.rows()));
  protected readonly shown = computed(() =>
    filterRows(
      this.rows(),
      this.query(),
      this.familyId() === ALL_FAMILIES ? null : this.familyId(),
    ),
  );
  protected readonly columns = computed<readonly FoldTableColumn<FeaturedRow>[]>(() => [
    { key: 'name', label: 'Article' },
    { key: 'family', label: 'Famille', width: '12rem' },
    { key: 'pro', label: `Pros (${featuredCount(this.rows(), 'pro')})`, width: '14rem' },
    {
      key: 'public',
      label: `Particuliers (${featuredCount(this.rows(), 'public')})`,
      width: '14rem',
    },
  ]);
  protected readonly nothingFound: FoldTableEmpty = {
    title: 'Aucun article ne correspond',
    subtitle: 'Videz la recherche ou choisissez « Toutes les familles ».',
  };
  protected readonly rowKey = (row: FeaturedRow): string => row.sku;

  ngOnInit(): void {
    void this.load();
    if (this.canReadCopy()) {
      void this.loadBadge();
    }
  }

  protected async load(): Promise<void> {
    try {
      this.items.set(await this.catalogue.list());
      this.state.set('ready');
    } catch {
      if (this.state() !== 'ready') {
        this.state.set('error');
      }
    }
  }

  /** Le libellé est un plus : son échec n'empêche pas de régler la table. */
  private async loadBadge(): Promise<void> {
    try {
      this.badge.set(badgeCopyOf(await this.shopCopy.load()));
    } catch {
      this.badge.set(null);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode.
  protected cell(row: FeaturedRow, audience: ShopAudience): FeaturedCell {
    return row[audience];
  }

  /** Une case fermée reste DÉCOCHABLE : retirer une mise en avant n'est jamais refusé. */
  protected disabled(row: FeaturedRow, audience: ShopAudience): boolean {
    const cell = row[audience];
    return (
      !this.canWrite() ||
      this.pending().has(`${row.sku}:${audience}`) ||
      (cell.state !== 'open' && !cell.featured)
    );
  }

  protected async toggle(
    row: FeaturedRow,
    audience: ShopAudience,
    featured: boolean,
  ): Promise<void> {
    const key = `${row.sku}:${audience}`;
    this.pending.update((set) => new Set([...set, key]));
    this.actionFailure.set(null);
    try {
      await this.catalogue.setFeatured(row.sku, audience, featured);
    } catch (error) {
      this.actionFailure.set(
        httpErrorMessage(error, `La mise en avant de « ${row.name} » n’a pas été enregistrée.`),
      );
    }
    // Relire dans les deux cas : la case revient à ce que le serveur tient.
    await this.load();
    this.pending.update((set) => new Set([...set].filter((entry) => entry !== key)));
  }
}
