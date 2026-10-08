import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { refundedCentsOf, type OrderRefundStatus, type OrderRefundView } from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  type FoldBadgeVariant,
} from 'fold-ng';

/** Comment se dit, et se colore, le statut Stripe d'un remboursement. */
const STATUS: Readonly<Record<OrderRefundStatus, { label: string; variant: FoldBadgeVariant }>> = {
  pending: { label: 'En cours', variant: 'warning' },
  requires_action: { label: 'Action requise chez Stripe', variant: 'warning' },
  succeeded: { label: 'Remboursé', variant: 'success' },
  failed: { label: 'Échoué', variant: 'alert' },
  canceled: { label: 'Annulé', variant: 'neutral' },
};

/** Une ligne de la carte, déjà mise en forme. */
interface RefundRow {
  readonly amount: string;
  readonly status: string;
  readonly variant: FoldBadgeVariant;
  readonly refundedAt: string;
}

/**
 * **« Remboursements »** sur la fiche d'une commande (plan
 * `plan-facture-carte-et-remboursements.md`, lot R1) : ce que Stripe a rendu,
 * constaté par le webhook — montant, statut, date. Le geste, lui, reste dans
 * le tableau de bord Stripe : la carte n'a aucun bouton.
 *
 * Rien n'est rendu sans remboursement : la carte n'existe que si elle a
 * quelque chose à dire, comme la preuve de livraison.
 */
@Component({
  selector: 'app-order-refunds-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldBadgeComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './order-refunds-card.html',
})
export class OrderRefundsCard {
  readonly refunds = input.required<readonly OrderRefundView[]>();

  protected readonly rows = computed<readonly RefundRow[]>(() =>
    this.refunds().map((refund) => ({
      amount: formatCents(refund.amountCents),
      status: STATUS[refund.status].label,
      variant: STATUS[refund.status].variant,
      refundedAt: refund.refundedAt,
    })),
  );

  /** Le cumul des remboursements réussis, mis en forme. */
  protected readonly total = computed(() => formatCents(refundedCentsOf(this.refunds())));
}
