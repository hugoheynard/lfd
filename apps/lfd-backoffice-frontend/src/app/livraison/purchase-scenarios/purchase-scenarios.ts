import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { PurchaseScenarioSummaryView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { scenarioUpdatedLabel } from '../delivery-simulator';
import { purchaseScenarioSizeLabel } from '../purchase-scenarios';
import { PurchaseScenariosService } from '../purchase-scenarios.service';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly PurchaseScenarioSummaryView[] };

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'name', label: 'Scénario' },
  { key: 'size', label: 'Sélection' },
  { key: 'updated', label: 'Enregistré' },
  { key: 'actions', label: '' },
];

/**
 * **Les scénarios d'achat enregistrés**
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D5) : visibles
 * de toute l'équipe qui lit les tournées ; archiver et réactiver demandent
 * `delivery_rounds:write` (`canWrite`, B-D6). Ouvrir est rendu au tableau,
 * qui remet la sélection dans ses cases. Les archivés se montrent sur demande.
 */
@Component({
  selector: 'app-purchase-scenarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './purchase-scenarios.html',
  styleUrl: './purchase-scenarios.scss',
})
export class PurchaseScenarios {
  private readonly scenarios = inject(PurchaseScenariosService);
  private readonly notify = inject(NotifyService);

  /** Change quand le tableau a enregistré : la liste se relit. */
  readonly revision = input(0);
  /** Le scénario ouvert au tableau, `null` s'il n'en vient d'aucun. */
  readonly currentId = input<string | null>(null);
  readonly canWrite = input(false);

  readonly opened = output<string>();
  readonly archived = output<string>();

  protected readonly state = signal<ListState>({ status: 'loading' });
  protected readonly includeArchived = signal(false);
  protected readonly pending = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly columns = COLUMNS;

  protected readonly rowKey = (row: PurchaseScenarioSummaryView): string => row.id;
  protected readonly sizeOf = purchaseScenarioSizeLabel;
  protected readonly updatedOf = (row: PurchaseScenarioSummaryView): string =>
    scenarioUpdatedLabel(row.updatedAt, row.updatedBy);

  constructor() {
    effect(() => {
      this.revision();
      this.includeArchived();
      untracked(() => void this.load());
    });
  }

  protected retry(): void {
    void this.load();
  }

  protected async archive(row: PurchaseScenarioSummaryView): Promise<void> {
    if (await this.act(row, () => this.scenarios.archive(row.id), `« ${row.name} » archivé.`)) {
      this.archived.emit(row.id);
    }
  }

  protected async reactivate(row: PurchaseScenarioSummaryView): Promise<void> {
    await this.act(row, () => this.scenarios.reactivate(row.id), `« ${row.name} » réactivé.`);
  }

  private async act(
    row: PurchaseScenarioSummaryView,
    write: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    if (this.pending() !== null) return false;
    this.pending.set(row.id);
    this.refusal.set(null);
    try {
      await write();
      this.notify.success(success);
      await this.load();
      return true;
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, `« ${row.name} » n’a pas pu être modifié.`));
      return false;
    } finally {
      this.pending.set(null);
    }
  }

  private async load(): Promise<void> {
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const view = await this.scenarios.list(this.includeArchived());
      this.state.set({ status: 'ready', rows: view.scenarios });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
