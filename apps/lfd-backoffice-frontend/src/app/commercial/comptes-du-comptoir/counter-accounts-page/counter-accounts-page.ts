import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CounterOpenedAccountRow } from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CounterOpenedAccountsService } from '../counter-opened-accounts.service';
import {
  convertLabel,
  convertQuestion,
  convertedMessage,
  identityLabel,
  missingLabel,
  openedLabel,
} from '../counter-opened-accounts-wording';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Commercial › Comptes du comptoir** (`plan-comptes-du-comptoir.md`, § 4) :
 * les comptes pro ouverts au comptoir, ce qu'ils doivent et ce qui manque pour
 * les convertir. « Convertir » les passe en attente de validation, ou les
 * active directement quand rien ne manque ; la table se relit ensuite.
 *
 * Sous `b2b_companies:read`, comme la route ; le geste demande `:write`.
 */
@Component({
  selector: 'app-counter-accounts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './counter-accounts-page.html',
  styleUrl: './counter-accounts-page.scss',
})
export class CounterAccountsPage {
  private readonly api = inject(CounterOpenedAccountsService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_companies:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly CounterOpenedAccountRow[]>([]);
  protected readonly totalCents = signal(0);
  /** Le compte dont la conversion est en vol — une à la fois. */
  protected readonly pending = signal<string | null>(null);

  protected readonly tableTitle = computed(() => {
    const count = this.rows().length;
    return `${count} compte${count > 1 ? 's' : ''}`;
  });

  protected readonly columns: readonly FoldTableColumn<CounterOpenedAccountRow>[] = [
    { key: 'company', label: 'Enseigne' },
    { key: 'contact', label: 'Contact' },
    { key: 'opened', label: 'Ouvert' },
    { key: 'orders', label: 'Commandes au compte', numeric: true },
    { key: 'due', label: 'Dû', numeric: true },
    { key: 'missing', label: 'Ce qui manque' },
    { key: 'action', label: '', width: '10rem' },
  ];

  protected readonly rowKey = (row: CounterOpenedAccountRow): string => row.companyId;
  protected readonly euros = formatCents;
  protected readonly missingLabel = missingLabel;
  protected readonly identityLabel = identityLabel;
  protected readonly openedLabel = openedLabel;
  protected readonly convertLabel = convertLabel;
  protected readonly convertQuestion = convertQuestion;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      await this.read();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Convertit le compte, puis relit la table. Un refus affiche le message du serveur. */
  protected async convert(row: CounterOpenedAccountRow): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(row.companyId);
    try {
      const result = await this.api.convert(row.companyId);
      this.notify.success(convertedMessage(row.enseigne, result.status));
      await this.read();
    } catch (error) {
      this.notify.error(error, "Le compte n'a pas pu être converti.");
    } finally {
      this.pending.set(null);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode qui
  // rend la ligne typée.
  protected of(row: CounterOpenedAccountRow): CounterOpenedAccountRow {
    return row;
  }

  private async read(): Promise<void> {
    const view = await this.api.list();
    this.rows.set(view.accounts);
    this.totalCents.set(view.totalOutstandingCents);
  }
}
