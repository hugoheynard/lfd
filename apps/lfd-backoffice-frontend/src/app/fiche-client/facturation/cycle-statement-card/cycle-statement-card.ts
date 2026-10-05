import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  CycleStatementGroupView,
  CycleStatementOrderView,
  CycleStatementView,
  StatementCycleView,
} from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { saveBlob } from '../../../shared/download/save-blob';
import { cycleLabel, monthLabel, vatRateLabel } from '../cycle-statement-labels';
import { CycleStatementService } from '../cycle-statement.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le relevé de cycle** d'un client — ce qu'il doit pour un mois, commande
 * par commande (plan `agregation-des-commandes`, A2).
 *
 * Provisoire, et l'écran le dit : tant qu'aucun lot n'est figé (S4-0), le
 * relevé est recalculé à chaque lecture, et une commande annulée après coup en
 * sort. Le périmètre est écrit par le serveur, pas recopié ici.
 *
 * **La vue payeur** (avant S4) : le relevé d'un principal montre ses commandes,
 * puis un bloc par site qui le suivait en facturation à la date de chaque
 * commande, avec son sous-total ; ses entités rattachées qui règlent seules
 * sont listées à part, sans montant. Le relevé d'un site reste ses seules
 * commandes, et nomme le principal qui les règle. Le groupement est fait par le
 * serveur : l'écran ne trie rien.
 */
@Component({
  selector: 'app-cycle-statement-card',
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
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    RouterLink,
  ],
  templateUrl: './cycle-statement-card.html',
  styleUrl: './cycle-statement-card.scss',
})
export class CycleStatementCard {
  readonly companyId = input.required<string>();

  private readonly service = inject(CycleStatementService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly cycles = signal<readonly StatementCycleView[]>([]);
  protected readonly month = signal<string | null>(null);
  protected readonly statement = signal<CycleStatementView | null>(null);
  protected readonly exporting = signal(false);

  /** L'export reste à la comptabilité : le serveur le refuse sans ce droit. */
  protected readonly canExport = computed(() => this.permissions.can('b2b_accounting:read'));

  protected readonly cycleChoices = computed<FoldSelectOption<string>[]>(() =>
    this.cycles().map((cycle) => ({ value: cycle.month, label: cycleLabel(cycle) })),
  );

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Référence' },
    { key: 'ht', label: 'HT', numeric: true },
    { key: 'discounts', label: 'Remise et bon', numeric: true },
    { key: 'delivery', label: 'Livraison', numeric: true },
    { key: 'lateFee', label: 'Surtaxe', numeric: true },
    { key: 'vat', label: 'TVA', numeric: true },
    { key: 'total', label: 'TTC', numeric: true },
  ];

  protected readonly rowKey = (order: CycleStatementOrderView): string => order.id;

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => void this.loadCycles(id));
    });
  }

  protected euros(cents: number): string {
    return formatCents(cents);
  }

  protected day(iso: string): string {
    return formatOrderDate(iso);
  }

  protected rate(rate: number): string {
    return vatRateLabel(rate);
  }

  protected title(statement: CycleStatementView): string {
    return `Relevé de ${monthLabel(statement.cycle.month)}`;
  }

  /** Les groupes qui ont des commandes — un site sans commande ne fait pas de bloc. */
  protected shownGroups(statement: CycleStatementView): readonly CycleStatementGroupView[] {
    return statement.groups.filter((group) => group.orders.length > 0);
  }

  protected groupTitle(group: CycleStatementGroupView): string {
    return group.ownOrders ? `${group.label} — commandes propres` : group.label;
  }

  protected groupSubtitle(group: CycleStatementGroupView): string {
    const count = group.totals.orderCount;
    return `${count} commande${count > 1 ? 's' : ''} · sous-total ${formatCents(group.totals.totalCents)} TTC`;
  }

  /** Le payeur nommé sur le relevé d'un site, ou `null` s'il règle tout lui-même. */
  protected payerOf(statement: CycleStatementView): string | null {
    for (const group of statement.groups) {
      const paid = group.orders.find((order) => order.paidBy !== null);
      if (paid?.paidBy) {
        return paid.paidBy.name;
      }
    }
    return null;
  }

  protected onMonth(month: string): void {
    this.month.set(month);
    void this.loadStatement(this.companyId(), month);
  }

  /** La commande s'ouvre sous la fiche de la société qui l'a passée — le site. */
  protected open(order: CycleStatementOrderView): void {
    void this.router.navigate(['/comptes-clients', order.companyId, 'commandes', order.id]);
  }

  protected async retry(): Promise<void> {
    const month = this.month();
    await (month === null
      ? this.loadCycles(this.companyId())
      : this.loadStatement(this.companyId(), month));
  }

  protected async exportCsv(): Promise<void> {
    const month = this.month();
    if (month === null) {
      return;
    }
    this.exporting.set(true);
    try {
      const file = await this.service.exportCsv(this.companyId(), month);
      saveBlob(file.blob, file.fileName ?? `RELEVE-PROVISOIRE-${month}.csv`);
      this.notify.success(`Relevé de ${monthLabel(month)} exporté.`);
    } catch (error) {
      this.notify.error(error, "L'export du relevé a échoué. Réessayez dans un instant.");
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadCycles(companyId: string): Promise<void> {
    this.state.set('loading');
    try {
      const { cycles } = await this.service.cycles();
      this.cycles.set(cycles);
      const first = cycles[0];
      if (first === undefined) {
        this.state.set('error');
        return;
      }
      this.month.set(first.month);
      await this.loadStatement(companyId, first.month);
    } catch {
      this.state.set('error');
    }
  }

  private async loadStatement(companyId: string, month: string): Promise<void> {
    this.state.set('loading');
    try {
      this.statement.set(await this.service.statement(companyId, month));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
