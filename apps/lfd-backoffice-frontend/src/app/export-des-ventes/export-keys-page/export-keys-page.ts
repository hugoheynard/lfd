import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ExportReaderKeyView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ExportKeyIssuePanel } from '../export-key-issue-panel/export-key-issue-panel';
import {
  exportKeyDate,
  exportKeyIps,
  exportKeyState,
  type ExportKeyState,
} from '../export-key-state';
import { ExportKeysService } from '../export-keys.service';

type LoadState = 'loading' | 'error' | 'ready';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'label', label: 'Libellé' },
  { key: 'created', label: 'Créée le' },
  { key: 'expires', label: 'Expire le' },
  { key: 'ips', label: 'Adresses admises' },
  { key: 'state', label: 'État' },
  { key: 'actions', label: '', align: 'right' },
];

/**
 * **Export des ventes** — les clés de lecture que le script de la Direction
 * présente à l'export (plan `documentation/commandes/export/plan-export-des-ventes.md`,
 * § 6.1 et § 6.5). Une clé par lecteur ; son secret n'est montré qu'à la
 * création. Sous `exports` : sans l'écriture, tout se lit et rien ne se change.
 * Les auteurs ne sont pas servis (identifiants staff seulement), l'écran ne
 * les montre donc pas.
 */
@Component({
  selector: 'app-export-keys-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './export-keys-page.html',
})
export class ExportKeysPage {
  private readonly api = inject(ExportKeysService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly columns = COLUMNS;
  protected readonly date = exportKeyDate;
  protected readonly ips = exportKeyIps;
  protected readonly canWrite = computed(() => this.permissions.can('exports:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly keys = signal<readonly ExportReaderKeyView[]>([]);
  protected readonly revoking = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  /** L'instant de la dernière lecture : une clé « expirée » l'est à ce moment-là. */
  private readonly readAt = signal(new Date());
  protected readonly rowKey = (row: ExportReaderKeyView): string => row.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.keys.set(await this.api.list());
      this.readAt.set(new Date());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected keyState(key: ExportReaderKeyView): ExportKeyState {
    return exportKeyState(key, this.readAt());
  }

  protected async issue(): Promise<void> {
    const ref = this.panels.open(ExportKeyIssuePanel, {});
    if ((await ref.closed) !== undefined) {
      this.notify.success('Clé créée.');
    }
    // Même fermé sans « J'ai collé la clé », une clé a pu être créée.
    await this.load();
  }

  protected async revoke(key: ExportReaderKeyView): Promise<void> {
    this.revoking.set(key.id);
    this.refusal.set(null);
    try {
      await this.api.revoke(key.id);
      this.notify.success(`Clé « ${key.label} » révoquée : l’export la refuse dès maintenant.`);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La révocation n’a pas abouti.'));
    } finally {
      this.revoking.set(null);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par une méthode qui
  // rend la ligne typée.
  protected of(row: ExportReaderKeyView): ExportReaderKeyView {
    return row;
  }
}
