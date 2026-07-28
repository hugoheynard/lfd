import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { formatPercent } from '../../../data/channels';
import { CatalogueApi, type TvaRegime } from '../../catalogue-api';

/**
 * La **gestion des régimes** : le formulaire de création et le tableau des taux
 * existants (Famille A — `tva-5-5`, `tva-10`, `tva-20`). Une brique autonome,
 * branchée sur {@link CatalogueApi} ; la page ne fait que la composer.
 */
@Component({
  selector: 'app-tva-regime-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
  ],
  templateUrl: './tva-regime-table.html',
  styleUrl: './tva-regime-table.scss',
})
export class TvaRegimeTable {
  private readonly api = inject(CatalogueApi);

  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly draftName = signal('');
  protected readonly draftDescription = signal('');
  protected readonly draftPercent = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'name', label: 'Nom', width: '12rem' },
    { key: 'description', label: 'Description' },
    { key: 'rate', label: 'Taux', width: '7rem' },
    { key: 'tag', label: 'Collection', width: '10rem' },
    { key: 'actions', label: '', align: 'right', width: '9rem' },
  ];

  protected readonly emptyState = {
    title: 'Aucun régime',
    subtitle: 'Créez au moins un taux (ex. 5,5 %, 10 %, 20 %).',
  };

  protected readonly rowKey = (regime: TvaRegime): string => regime.id;

  constructor() {
    void this.reload();
  }

  protected format(percent: number): string {
    return formatPercent(percent);
  }

  protected async create(): Promise<void> {
    const name = this.draftName().trim();
    const percent = this.draftPercent();
    if (name === '' || percent === null) {
      return;
    }
    await this.run(async () => {
      await this.api.createTvaRegime({
        name,
        description: this.draftDescription(),
        percent,
      });
      this.draftName.set('');
      this.draftDescription.set('');
      this.draftPercent.set(null);
    });
  }

  protected async remove(regime: TvaRegime): Promise<void> {
    await this.run(() => this.api.deleteTvaRegime(regime.id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.regimes.set(await this.api.listTvaRegimes());
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}
