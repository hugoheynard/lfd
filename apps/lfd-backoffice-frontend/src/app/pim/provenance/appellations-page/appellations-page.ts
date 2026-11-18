import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AppellationView } from '@lfd/pim-contracts';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDataTableRowCardDirective,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ArchivedList, type ArchivedEntry } from '../../shared/archived-list/archived-list';
import { AppellationPanel } from '../appellation-panel/appellation-panel';
import { ProvenanceStore } from '../provenance.store';

/**
 * **Appellations** — les signes officiels qu'un ingrédient peut porter.
 *
 * L'écran existe pour une raison précise : une appellation est une affirmation
 * RÉGLEMENTÉE. En champ libre sur chaque ingrédient, le même signe s'écrirait
 * « AOP Beaufort », « A.O.P. Beaufort », « aop beaufort » — trois valeurs pour
 * une réalité, et un badge qui ne peut plus être fiable. La table lui donne une
 * identité ; cet écran la rend pilotable.
 */
@Component({
  selector: 'app-appellations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldDataTableComponent,
    // Sans elle, `foldCell` n'est qu'un attribut inerte sur un `ng-template` :
    // le build reste vert et les lignes rendent le vide.
    FoldDataTableCellDirective,
    FoldDataTableRowCardDirective,
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldButtonComponent,
    FoldIconComponent,
    ArchivedList,
  ],
  templateUrl: './appellations-page.html',
  styleUrl: './appellations-page.scss',
})
export class AppellationsPage {
  private readonly store = inject(ProvenanceStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('pim_catalog:write'));
  /** Le tableau ne montre que celles qui ne sont pas archivées ; les archivées sont repliées dessous. */
  protected readonly appellations = computed(() =>
    this.store.appellations().filter((row) => !row.archived),
  );
  private readonly notify = inject(NotifyService);
  protected readonly busy = signal(false);
  protected readonly archived = computed<readonly ArchivedEntry[]>(() =>
    this.store.archivedAppellations().map((row) => ({
      key: row.code,
      label: row.label.fr,
      detail: row.usedBy > 0 ? `portée par ${String(row.usedBy)} ingrédient(s)` : row.code,
    })),
  );
  protected readonly loadError = this.store.appellationError;

  private readonly allColumns: readonly FoldTableColumn[] = [
    { key: 'label', label: 'Appellation' },
    { key: 'scheme', label: 'Signe', width: '10rem' },
    { key: 'used', label: 'Portée par', width: '10rem' },
    { key: 'state', label: 'État', width: '9rem' },
    { key: 'actions', label: '', width: '3.5rem' },
  ];

  /** Sans le droit d'écrire, la colonne d'actions n'a rien à porter. */
  protected readonly columns = computed(() =>
    this.canWrite()
      ? this.allColumns
      : this.allColumns.filter((column) => column.key !== 'actions'),
  );

  protected readonly rowKey = (row: AppellationView): string => row.code;

  protected usedLabel(row: AppellationView): string {
    return row.usedBy === 0 ? 'Aucun ingrédient' : `${String(row.usedBy)} ingrédient(s)`;
  }

  protected open(appellation?: AppellationView): void {
    this.panelHost.open<boolean>(AppellationPanel, {
      side: 'right',
      ...(appellation === undefined ? {} : { data: { appellation } }),
    });
  }

  protected retry(): void {
    void this.store.reloadAppellations().catch(() => undefined);
  }

  protected async restore(key: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.restoreAppellation(key);
    } catch (caught) {
      this.notify.refused(caught, 'Restauration refusée.');
    } finally {
      this.busy.set(false);
    }
  }
}
