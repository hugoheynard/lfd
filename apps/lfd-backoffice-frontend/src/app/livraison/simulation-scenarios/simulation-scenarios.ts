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
import type { DeliverySimulationScenarioSummaryView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
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
import { DeliverySimulationScenariosService } from '../delivery-simulation-scenarios.service';
import { scenarioSizeLabel, scenarioUpdatedLabel } from '../delivery-simulator';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly DeliverySimulationScenarioSummaryView[] };

const READ_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'name', label: 'Scénario' },
  { key: 'size', label: 'Contenu' },
  { key: 'updated', label: 'Enregistré' },
  { key: 'actions', label: '' },
];

/**
 * **Les scénarios enregistrés** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C7) : visibles de toute l'équipe qui lit les tournées ; dupliquer et
 * archiver demandent `delivery_rounds:write` (`canWrite`). Ouvrir est rendu
 * à la page, qui remplit l'écran.
 */
@Component({
  selector: 'app-simulation-scenarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './simulation-scenarios.html',
  styleUrl: './simulation-scenarios.scss',
})
export class SimulationScenarios {
  private readonly scenarios = inject(DeliverySimulationScenariosService);
  private readonly notify = inject(NotifyService);

  /** Change quand la page a enregistré : la liste se relit. */
  readonly revision = input(0);
  /** Le scénario ouvert à l'écran, `null` s'il n'en vient d'aucun. */
  readonly currentId = input<string | null>(null);
  readonly canWrite = input(false);

  readonly opened = output<string>();
  readonly archived = output<string>();

  protected readonly state = signal<ListState>({ status: 'loading' });
  protected readonly pending = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly columns = READ_COLUMNS;

  protected readonly rowKey = (row: DeliverySimulationScenarioSummaryView): string => row.id;
  protected readonly sizeOf = (row: DeliverySimulationScenarioSummaryView): string =>
    scenarioSizeLabel(row.stops, row.vehicles);
  protected readonly updatedOf = (row: DeliverySimulationScenarioSummaryView): string =>
    scenarioUpdatedLabel(row.updatedAt, row.updatedBy);

  constructor() {
    effect(() => {
      this.revision();
      untracked(() => void this.load());
    });
  }

  protected retry(): void {
    void this.load();
  }

  protected async duplicate(row: DeliverySimulationScenarioSummaryView): Promise<void> {
    await this.act(row, () => this.scenarios.duplicate(row.id), `« ${row.name} » dupliqué.`);
  }

  protected async archive(row: DeliverySimulationScenarioSummaryView): Promise<void> {
    if (await this.act(row, () => this.scenarios.archive(row.id), `« ${row.name} » archivé.`)) {
      this.archived.emit(row.id);
    }
  }

  private async act(
    row: DeliverySimulationScenarioSummaryView,
    write: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    if (this.pending() !== null) {
      return false;
    }
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
      this.state.set({ status: 'ready', rows: await this.scenarios.list() });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
