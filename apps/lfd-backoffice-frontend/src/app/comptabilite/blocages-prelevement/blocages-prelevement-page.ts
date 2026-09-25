import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DirectDebitBlockView } from '@lfd/contracts';
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
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DirectDebitBlocksService } from '../direct-debit-blocks.service';
import { BlockDialog, type BlockDialogData } from './block-dialog/block-dialog';

/** Ce que la liste montre : les seules sociétés bloquées, ou toutes celles au crédit. */
export type BlockFilter = 'blocked' | 'all';

const FILTERS: readonly { readonly value: BlockFilter; readonly label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'blocked', label: 'Bloquées' },
];

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'company', label: 'Société' },
  { key: 'state', label: 'État' },
  { key: 'since', label: 'Depuis' },
  { key: 'by', label: 'Par' },
  { key: 'reason', label: 'Raison' },
];

/**
 * **Comptabilité › Blocages du prélèvement** — qui, parmi les clients au crédit
 * mensuel, règle désormais par carte, depuis quand, et pourquoi.
 *
 * Le blocage est un drapeau SÉPARÉ du crédit accordé : la liste ne montre donc
 * que les sociétés qui ont un crédit, bloqué ou non. L'écran ne décide rien —
 * « déjà bloqué », « aucun crédit » sont des refus de l'agrégat, affichés tels
 * que le serveur les rédige.
 *
 * Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1.
 */
@Component({
  selector: 'app-blocages-prelevement-page',
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
    FoldListboxComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './blocages-prelevement-page.html',
  styleUrl: './blocages-prelevement-page.scss',
})
export class BlocagesPrelevementPage {
  private readonly api = inject(DirectDebitBlocksService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly rows = signal<readonly DirectDebitBlockView[]>([]);
  protected readonly loading = signal(true);
  /** L'échec de la LECTURE — rien à montrer. */
  protected readonly loadError = signal<string | null>(null);
  /** L'échec d'un GESTE — la liste reste à l'écran. */
  protected readonly actionError = signal<string | null>(null);
  /** La société dont le déblocage est en vol. */
  protected readonly pending = signal<string | null>(null);

  protected readonly filters = FILTERS;
  protected readonly filter = signal<BlockFilter>('all');

  /**
   * Bloquer et débloquer demandent `b2b_deferred_payment_block:write` — pas
   * `b2b_accounting:write`, qui ouvre la comptabilité sans ce geste (Hugo,
   * 2026-09-25). Sans lui, la colonne d'actions disparaît.
   */
  protected readonly canWrite = computed(() =>
    this.permissions.can('b2b_deferred_payment_block:write'),
  );

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );

  protected readonly visible = computed(() =>
    this.filter() === 'blocked' ? this.rows().filter((row) => row.block !== null) : this.rows(),
  );

  /** Aucune société au crédit : rien à bloquer, quel que soit le filtre. */
  protected readonly noCredit = computed(() => !this.loading() && this.rows().length === 0);

  /** Des sociétés au crédit, mais aucune bloquée sous le filtre « Bloquées ». */
  protected readonly noneBlocked = computed(
    () => !this.loading() && this.rows().length > 0 && this.visible().length === 0,
  );

  protected readonly rowKey = (row: DirectDebitBlockView): string => row.companyId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rows.set(await this.api.list());
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les blocages sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected setFilter(value: BlockFilter): void {
    this.filter.set(value);
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par des méthodes qui
  // rendent la ligne typée.
  protected nameOf(row: DirectDebitBlockView): string {
    return row.enseigne !== '' ? row.enseigne : row.raisonSociale;
  }

  protected sinceOf(row: DirectDebitBlockView): string {
    return row.block === null ? '' : formatOrderDate(row.block.blockedAt);
  }

  /** L'agent tel que l'annuaire le nomme — vide s'il n'y est pas rattaché. */
  protected byOf(row: DirectDebitBlockView): string {
    return row.block?.blockedBy?.name ?? '';
  }

  protected async block(row: DirectDebitBlockView): Promise<void> {
    const data: BlockDialogData = { companyId: row.companyId, companyName: this.nameOf(row) };
    const done = await this.panels.open<BlockDialogData, boolean>(BlockDialog, {
      data,
      width: 'md',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(`Prélèvement bloqué pour ${data.companyName}.`);
    await this.reload();
  }

  protected async unblock(row: DirectDebitBlockView): Promise<void> {
    this.pending.set(row.companyId);
    this.actionError.set(null);
    try {
      await this.api.unblock(row.companyId);
      this.notify.success(`Prélèvement rétabli pour ${this.nameOf(row)}.`);
      await this.reload();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "Le prélèvement n'a pas pu être rétabli."));
    } finally {
      this.pending.set(null);
    }
  }

  /** Relecture après un geste : l'auteur et l'instant sont posés par le serveur. */
  private async reload(): Promise<void> {
    try {
      this.rows.set(await this.api.list());
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'La liste n’a pas pu être relue.'));
    }
  }
}
