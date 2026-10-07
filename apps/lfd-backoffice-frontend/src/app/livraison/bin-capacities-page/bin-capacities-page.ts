import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BIN_CAPACITY_MAX_UNITS,
  BIN_CAPACITY_MIN_UNITS,
  type BinCapacitiesView,
  type BinProductView,
  type BinTypeView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowDetailDirective,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
  type FoldDataTableLabels,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import {
  capacityIndex,
  cellKey,
  coldGapLabel,
  coldWithoutIsotherm,
  missingLabel,
  readCell,
  skusWithoutCapacity,
  visibleProducts,
} from '../bin-capacities';
import { withCapacity } from '../bin-capacities-update';
import { DeliveryBinsService } from '../delivery-bins.service';

type GridState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: BinCapacitiesView };

/** La colonne d'un type de bac : un préfixe que la colonne produit ne porte pas. */
const BIN_COLUMN = 'bin:';

/** Le bouton du tiroir, dit en français. */
const TABLE_LABELS: Partial<FoldDataTableLabels> = {
  expandRow: 'Saisir les contenances',
  collapseRow: 'Fermer la saisie',
};

/**
 * **Les contenances** — combien d'unités de chaque produit tient un bac ENTIER
 * de chaque type (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 4 bis v2-2 et v2-3). Lignes : les produits vendus ; colonnes : les types
 * proposés (non archivés).
 *
 * La grille se LIT : une colonne par type, le nombre dans la case. Elle se
 * SAISIT dans le tiroir de la ligne, un champ nommé par type — et non dans la
 * case : un gabarit `foldCell` par colonne créé dans un `@for` n'a pas encore
 * sa clé quand la table se rend (NG0950, constaté le 2026-09-29 sur fold-ng
 * 0.27.2), et un champ sans libellé n'aurait pas de nom accessible.
 *
 * Chaque case s'enregistre seule, en quittant le champ. Une case vide n'a PAS
 * de contenance, et la vider retire celle qu'elle avait : rien n'est deviné,
 * et le colisage signalera le produit. Le filtre « sans aucune contenance »
 * montre ceux qu'il signalera — et avec eux les produits FROIDS (❄) qui n'ont
 * de contenance que dans des bacs non isothermes : ils n'iraient dans aucun.
 *
 * Après une écriture réussie, la case est mise à jour sur place au lieu de
 * relire toute la grille : relire remplacerait les lignes sous le curseur au
 * moment même où l'on passe à la case suivante.
 *
 * Sans `delivery_settings:write`, la grille se lit et rien ne s'y saisit.
 */
@Component({
  selector: 'app-bin-capacities-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldDataTableRowDetailDirective,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
    RouterLink,
  ],
  templateUrl: './bin-capacities-page.html',
  styleUrl: './bin-capacities-page.scss',
})
export class BinCapacitiesPage {
  private readonly api = inject(DeliveryBinsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<GridState>({ status: 'loading' });
  protected readonly term = signal('');
  /** Le filtre des manques : sans contenance, ou froid sans bac isotherme. */
  protected readonly onlyGaps = signal(false);
  /** Les cases en cours de saisie, par clé — ce qu'on tape avant de quitter la case. */
  protected readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());
  /** Les cases dont l'écriture est en vol. */
  protected readonly saving = signal<ReadonlySet<string>>(new Set());
  /** La saisie refusée ou l'écriture en échec — la grille reste. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));
  protected readonly bounds = { min: BIN_CAPACITY_MIN_UNITS, max: BIN_CAPACITY_MAX_UNITS } as const;

  private readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly types = computed(() => this.view()?.types ?? []);
  protected readonly products = computed(() => this.view()?.products ?? []);

  private readonly index = computed(() => capacityIndex(this.view()?.capacities ?? []));

  private readonly missing = computed(() =>
    skusWithoutCapacity(
      this.products(),
      this.types().map((type) => type.id),
      this.index(),
    ),
  );

  private readonly coldGaps = computed(() =>
    coldWithoutIsotherm(this.products(), this.types(), this.index()),
  );

  /** Tout ce qui est à compléter — ce que le colisage signalera. */
  private readonly gaps = computed(
    () => new Set([...this.missing(), ...this.coldGaps()]) as ReadonlySet<string>,
  );

  protected readonly missingCount = computed(() => missingLabel(this.missing().size));
  protected readonly coldGapCount = computed(() => coldGapLabel(this.coldGaps().size));

  protected readonly rows = computed(() =>
    visibleProducts(this.products(), this.term(), this.onlyGaps(), this.gaps()),
  );

  protected readonly columns = computed<readonly FoldTableColumn<BinProductView>[]>(() => [
    { key: 'product', label: 'Produit' },
    ...this.types().map((type) => ({
      key: `${BIN_COLUMN}${type.id}`,
      label: type.name,
      numeric: true,
      value: (product: BinProductView) => this.cellText(type, product),
    })),
  ]);

  protected readonly nothingFound = computed(() =>
    this.onlyGaps()
      ? {
          title: 'Rien à compléter',
          subtitle: 'Tous les produits trouvés ont une contenance, et les froids un bac isotherme.',
        }
      : { title: 'Aucun produit trouvé', subtitle: 'Essayez un autre nom ou un autre SKU.' },
  );

  protected readonly rowKey = (product: BinProductView): string => product.sku;
  /** Un produit à compléter se voit : le colisage le signalera. */
  protected readonly toneOf = (product: BinProductView): FoldTableTone =>
    this.gaps().has(product.sku) ? 'warning' : null;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected readonly tableLabels = TABLE_LABELS;

  // Le contexte d'un `foldCell` n'est pas typé (`let-row` est `any`) : on entre
  // par des méthodes, qui rendent la ligne typée au passage.
  protected productName(product: BinProductView): string {
    return product.name;
  }

  protected productSku(product: BinProductView): string {
    return product.sku;
  }

  protected isCold(product: BinProductView): boolean {
    return product.requiresCold;
  }

  protected isColdGap(product: BinProductView): boolean {
    return this.coldGaps().has(product.sku);
  }

  /** Ce que la case montre : la saisie en cours, sinon la contenance enregistrée. */
  protected cellValue(type: BinTypeView, product: BinProductView): number | null {
    const key = cellKey(type.id, product.sku);
    const drafts = this.drafts();
    return drafts.has(key) ? (drafts.get(key) ?? null) : (this.index().get(key) ?? null);
  }

  /** « 24 », ou « — » quand la case n'a pas de contenance. */
  protected cellText(type: BinTypeView, product: BinProductView): string {
    const units = this.index().get(cellKey(type.id, product.sku));
    return units === undefined ? '—' : units.toLocaleString('fr-FR');
  }

  protected isSaving(type: BinTypeView, product: BinProductView): boolean {
    return this.saving().has(cellKey(type.id, product.sku));
  }

  protected edit(type: BinTypeView, product: BinProductView, value: number | null): void {
    const next = new Map(this.drafts());
    next.set(cellKey(type.id, product.sku), value);
    this.drafts.set(next);
  }

  /** On quitte la case : ce qui a changé s'écrit, seul. */
  protected async commit(type: BinTypeView, product: BinProductView): Promise<void> {
    const key = cellKey(type.id, product.sku);
    const drafts = this.drafts();
    if (!drafts.has(key) || this.saving().has(key)) {
      return;
    }
    const reading = readCell(drafts.get(key) ?? null);
    if (!reading.ok) {
      this.refusal.set(`« ${product.name} » dans « ${type.name} » : ${reading.issue}`);
      return;
    }
    if (reading.units === (this.index().get(key) ?? null)) {
      this.forget(key);
      return;
    }
    this.refusal.set(null);
    this.saving.set(new Set([...this.saving(), key]));
    try {
      await this.api.setCapacity({ binTypeId: type.id, sku: product.sku, units: reading.units });
      this.record(type.id, product.sku, reading.units);
      this.forget(key);
      this.notify.success(
        reading.units === null
          ? `Contenance retirée : « ${product.name} » dans « ${type.name} ».`
          : `Contenance enregistrée : ${String(reading.units)} « ${product.name} » par « ${type.name} ».`,
      );
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(
          error,
          `La contenance de « ${product.name} » n'a pas pu être enregistrée.`,
        ),
      );
    } finally {
      const still = new Set(this.saving());
      still.delete(key);
      this.saving.set(still);
    }
  }

  private forget(key: string): void {
    const next = new Map(this.drafts());
    next.delete(key);
    this.drafts.set(next);
  }

  /** La case écrite, reportée dans la vue lue — sans relire la grille. */
  private record(binTypeId: string, sku: string, units: number | null): void {
    const state = this.state();
    if (state.status !== 'ready') {
      return;
    }
    this.state.set({ status: 'ready', view: withCapacity(state.view, binTypeId, sku, units) });
  }

  private async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const view = await this.api.capacities();
      this.drafts.set(new Map());
      this.state.set({ status: 'ready', view });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
