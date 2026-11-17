import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ProductionDisplayView, WorkstationsPageView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { ProductionSettingsService } from '../production-settings.service';
import { WorkstationsService } from '../workstations.service';
import { ProductionGroupingCard } from './production-grouping-card/production-grouping-card';
import { WorkstationListCard } from './workstation-list-card/workstation-list-card';
import { WorkstationProductsCard } from './workstation-products-card/workstation-products-card';

/** La valeur de `?filtre=` qui ouvre la liste sur les produits sans poste. */
export const UNPLACED_FILTER = 'a-ranger';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Prod manager › Postes** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.8) : les postes du fournil, le poste de chaque produit, le réglage
 * mode boutique / mode prod et ses deux simulations.
 *
 * Une page de détail : plusieurs sujets, une `fold-card` chacun. Elle relit
 * tout après chaque geste accepté. Le réglage se lit sous `production_settings`
 * à part : sans lui, la carte du mode le dit et la page reste.
 */
@Component({
  selector: 'app-workstations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    ProductionGroupingCard,
    WorkstationListCard,
    WorkstationProductsCard,
  ],
  templateUrl: './workstations-page.html',
  styleUrl: './workstations-page.scss',
})
export class WorkstationsPage {
  private readonly api = inject(WorkstationsService);
  private readonly settings = inject(ProductionSettingsService);
  private readonly permissions = inject(PermissionsStore);

  /** `?filtre=a-ranger` : l'alerte du Prod manager ouvre la liste filtrée. */
  readonly filter = input<string | undefined>(undefined, { alias: 'filtre' });
  protected readonly unplacedFirst = computed(() => this.filter() === UNPLACED_FILTER);

  protected readonly canWrite = computed(() =>
    this.permissions.can('production_workstations:write'),
  );
  protected readonly canReadMode = computed(() => this.permissions.can('production_settings:read'));
  protected readonly canSetMode = computed(() => this.permissions.can('production_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<WorkstationsPageView | null>(null);
  /** Le réglage du fournil ; `null` : non lu (droit absent, ou panne). */
  protected readonly display = signal<ProductionDisplayView | null>(null);

  /** Les produits commandés ces jours-ci sans poste : le compte de la confirmation. */
  protected readonly unplacedOrdered = computed(
    () =>
      this.view()?.products.filter((product) => product.ordered && product.workstationId === null)
        .length ?? 0,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (this.view() === null) {
      this.state.set('loading');
    }
    const [page, display] = await Promise.allSettled([this.api.page(), this.readDisplay()]);
    if (page.status === 'rejected') {
      // Une relecture ratée garde la page sous les yeux : seul le premier échec la remplace.
      if (this.view() === null) {
        this.state.set('error');
      }
      return;
    }
    this.view.set(page.value);
    this.display.set(display.status === 'fulfilled' ? display.value : null);
    this.state.set('ready');
  }

  private async readDisplay(): Promise<ProductionDisplayView | null> {
    if (!this.permissions.can('production_settings:read')) {
      return null;
    }
    return (await this.settings.settings()).display ?? null;
  }
}
