import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { FoldBadgeComponent, type FoldBadgeVariant, FoldButtonComponent } from 'fold-ng';

import { paymentTermLabel } from '../../account/account.model';
import { CommandPeriodCard } from '../command-period-card/command-period-card';
import { CommandSingle } from '../command-single/command-single';
import { formatEurValue } from '../../data/catalogue-seed';
import type { BillingPeriod, PeriodStatus } from '../billing-periods';
import { buildMonthlyLedger, type LedgerRow } from '../monthly-ledger';
import { orderStatusVariant } from '../order-status';
import type { CommandeRow } from '../orders-demo-seed';
import type { PaymentRegimeChange } from '../payment-regime-changes';

/** Présentation d'un statut de période : libellé, ton du badge, classe du rail. */
interface StatusMeta {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
  readonly rail: string;
}

const STATUS_META: Record<PeriodStatus, StatusMeta> = {
  current: { label: 'En cours', variant: 'neutral', rail: 'current' },
  due: { label: 'À régler', variant: 'warning', rail: 'due' },
  // En retard = « à régler » plus urgent : on reste sur le ton warning (pas de rouge).
  overdue: { label: 'En retard', variant: 'warning', rail: 'due' },
  paid: { label: 'Réglé', variant: 'success', rail: 'paid' },
};

/**
 * **Relevés & règlements** — un grand livre en **grille alignée par mois** :
 *
 * - colonne **Mois** (première colonne) : le mois et le résumé de son relevé ;
 * - colonne **Paiement périodique** : les commandes du relevé mensuel ;
 * - colonne **Payé à la commande** : les commandes réglées immédiatement, sur la
 *   **même rangée-mois** (les commandes de juin dans la rangée juin).
 *
 * Les **changements de régime** s'intercalent en pleine largeur à la couture du
 * mois où ils prennent effet.
 */
@Component({
  selector: 'app-billing-periods-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, CommandPeriodCard, CommandSingle],
  templateUrl: './billing-periods-view.html',
  styleUrl: './billing-periods-view.scss',
})
export class BillingPeriodsView {
  readonly periods = input.required<readonly BillingPeriod[]>();
  readonly immediateOrders = input<readonly CommandeRow[]>([]);
  readonly regimeChanges = input<readonly PaymentRegimeChange[]>([]);

  readonly downloadOrder = output<CommandeRow>();
  readonly settlePeriod = output<BillingPeriod>();

  /** Grand livre : rangées-mois (relevé + payé alignés) et changements de régime. */
  protected readonly ledger = computed<readonly LedgerRow[]>(() =>
    buildMonthlyLedger(this.periods(), this.immediateOrders(), this.regimeChanges()),
  );

  protected meta(status: PeriodStatus): StatusMeta {
    return STATUS_META[status];
  }

  protected readonly statusVariant = orderStatusVariant;
  protected readonly termLabel = paymentTermLabel;

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  protected fullDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  protected due(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected onDownload(order: CommandeRow): void {
    this.downloadOrder.emit(order);
  }

  protected onSettle(period: BillingPeriod): void {
    this.settlePeriod.emit(period);
  }
}
