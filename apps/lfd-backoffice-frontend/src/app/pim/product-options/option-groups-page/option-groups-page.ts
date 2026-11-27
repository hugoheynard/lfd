import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldPageLayoutComponent, FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ArchivedList, type ArchivedEntry } from '../../shared/archived-list/archived-list';
import { OptionGroupPanel } from '../option-group-panel/option-group-panel';
import { OptionGroupStore } from '../option-group.store';
import { OptionGroupTable } from '../option-group-table/option-group-table';

/**
 * **Options de commande** — le référentiel des groupes (« Tranchage ») et de
 * leurs choix (`plan-options-de-commande.md`, § 3.1). Page-coquille : l'action
 * « Ajouter un groupe », le tableau, et les groupes archivés avec « Restaurer ».
 * Une fiche active un groupe depuis sa propre carte.
 */
@Component({
  selector: 'app-option-groups-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, OptionGroupTable, ArchivedList],
  templateUrl: './option-groups-page.html',
})
export class OptionGroupsPage {
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);
  private readonly store = inject(OptionGroupStore);
  private readonly notify = inject(NotifyService);

  protected readonly busy = signal(false);
  protected readonly canWrite = computed(() => this.permissions.can('pim_catalog:write'));

  protected readonly archived = computed<readonly ArchivedEntry[]>(() =>
    this.store.archivedItems().map((group) => ({
      key: group.id,
      label: group.name,
      detail: group.choices.map((choice) => choice.label).join(', '),
    })),
  );

  protected openCreate(): void {
    this.panelHost.open<boolean>(OptionGroupPanel, { side: 'right' });
  }

  protected async restore(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.restore(id);
    } catch (caught) {
      this.notify.refused(caught, 'Restauration refusée.');
    } finally {
      this.busy.set(false);
    }
  }
}
