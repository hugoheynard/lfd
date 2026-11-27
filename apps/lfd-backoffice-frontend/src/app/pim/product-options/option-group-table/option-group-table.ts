import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { OptionChoiceView, OptionGroupView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonIconComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { optionAudienceLabel } from '../option-audience';
import { OptionGroupStore } from '../option-group.store';
import {
  OptionGroupPanel,
  type OptionGroupPanelData,
} from '../option-group-panel/option-group-panel';

const ALL_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'name', label: 'Groupe', width: '12rem' },
  { key: 'choices', label: 'Choix proposés' },
  { key: 'products', label: 'Activé sur', width: '9rem' },
  { key: 'actions', label: '', align: 'right', width: '4rem' },
];

/**
 * Le **tableau des groupes d'options** en service. Il lit le store et
 * n'expose que l'affichage : toute mutation passe par le panneau.
 */
@Component({
  selector: 'app-option-group-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
  ],
  templateUrl: './option-group-table.html',
})
export class OptionGroupTable {
  private readonly store = inject(OptionGroupStore);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('pim_catalog:write'));
  protected readonly groups = this.store.items;

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? ALL_COLUMNS : ALL_COLUMNS.filter((column) => column.key !== 'actions'),
  );

  /** Vide parce qu'il n'y en a pas, ou parce qu'on n'a pas pu lire. */
  protected readonly emptyState = computed(() =>
    this.store.loadError() === null
      ? { title: 'Aucun groupe', subtitle: 'Ajoutez-en un — « Tranchage » pour le pain.' }
      : { title: 'Groupes illisibles', subtitle: this.store.loadError() ?? '' },
  );

  protected readonly rowKey = (group: OptionGroupView): string => group.id;

  /** Les choix en service, dans l'ordre : « Tranché (Les deux) ». */
  protected activeChoices(group: OptionGroupView): readonly OptionChoiceView[] {
    return group.choices.filter((choice) => !choice.archived);
  }

  protected choiceLabel(choice: OptionChoiceView): string {
    return `${choice.label} · ${optionAudienceLabel(choice.audience)}`;
  }

  protected productsLabel(group: OptionGroupView): string {
    return group.products === 0 ? 'Aucune fiche' : `${String(group.products)} fiche(s)`;
  }

  protected open(group: OptionGroupView): void {
    const data: OptionGroupPanelData = { group };
    this.panelHost.open(OptionGroupPanel, { data, side: 'right' });
  }
}
