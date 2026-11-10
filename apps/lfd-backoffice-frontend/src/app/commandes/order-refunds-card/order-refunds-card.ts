import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderRefundStatus, OrderRefundView } from '@lfd/contracts';
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

/** Un remboursement noté par l'équipe, hors de la plateforme (plan M2, §5.5). */
const MANUAL: { readonly label: string; readonly variant: FoldBadgeVariant } = {
  label: 'Rendu autrement',
  variant: 'success',
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
 * `facture-carte-et-remboursements.md`) : ce que Stripe a rendu, constaté par
 * le webhook, et ce que l'équipe a noté « rendu autrement » (plan M2, §5.5) —
 * montant, statut, date. Les gestes vivent dans le bandeau des demandes : la
 * carte n'a aucun bouton.
 *
 * Le total est celui que SERT l'API (`refundedCents`, lu sur la position du
 * bloc `card-payment` — une seule arithmétique), jamais recalculé ici.
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
  /** Le cumul des remboursements réussis, en centimes, tel que l'API le sert. */
  readonly refundedCents = input.required<number>();

  protected readonly rows = computed<readonly RefundRow[]>(() =>
    this.refunds().map((refund) => {
      const status = refund.source === 'manual' ? MANUAL : STATUS[refund.status];
      return {
        amount: formatCents(refund.amountCents),
        status: status.label,
        variant: status.variant,
        refundedAt: refund.refundedAt,
      };
    }),
  );

  /** Le cumul servi, mis en forme. */
  protected readonly total = computed(() => formatCents(this.refundedCents()));
}
