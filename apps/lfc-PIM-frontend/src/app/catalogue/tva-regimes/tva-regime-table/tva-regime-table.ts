import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  type FoldTableColumn,
} from 'fold-ng';

import { formatPercent } from '../../../data/channels';
import { type TvaRegime } from '../../catalogue-api';
import { TvaStore } from '../tva-store';
import {
  TvaRegimeFormPanel,
  type TvaRegimePanelData,
} from '../tva-regime-form-panel/tva-regime-form-panel';

/**
 * Le **tableau des régimes** de TVA (Famille A — `tva-5-5`, `tva-10`,
 * `tva-20`). Il lit la liste depuis le {@link TvaStore} (backend) et n'expose que
 * l'affichage + un menu par ligne (modifier / supprimer) : toute mutation passe
 * par le side-panel et le store, donc la liste se met à jour toute seule.
 */
@Component({
  selector: 'app-tva-regime-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './tva-regime-table.html',
  styleUrl: './tva-regime-table.scss',
})
export class TvaRegimeTable {
  private readonly store = inject(TvaStore);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Liste réactive : suit le store, donc création / édition / suppression se voient direct. */
  protected readonly regimes = this.store.items;

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom', width: '12rem' },
    { key: 'description', label: 'Description' },
    { key: 'rate', label: 'Taux', width: '7rem' },
    { key: 'tag', label: 'Collection', width: '10rem' },
    { key: 'actions', label: '', align: 'right', width: '5rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucun régime',
    subtitle: 'Créez au moins un taux (ex. 5,5 %, 10 %, 20 %).',
  };

  protected readonly rowKey = (regime: TvaRegime): string => regime.id;

  protected format(percent: number): string {
    return formatPercent(percent);
  }

  /** Édition : side-panel prérempli sur ce régime. */
  protected openEdit(regime: TvaRegime): void {
    this.openPanel({ mode: 'edit', regime });
  }

  /** Suppression : side-panel en zone dangereuse (confirmation par le nom). */
  protected openDelete(regime: TvaRegime): void {
    this.openPanel({ mode: 'delete', regime });
  }

  private openPanel(data: TvaRegimePanelData): void {
    this.panelHost.open(TvaRegimeFormPanel, { data, side: 'right' });
  }
}
