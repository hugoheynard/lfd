import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  AdminRefundRequest,
  AdminRefundRequestState,
  AdminShortfallRefund,
  ShortfallRefundCause,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { GestureIntents } from '../../shared/gesture-intents';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldTextareaComponent,
  type FoldCalloutVariant,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';

/**
 * La borne du motif de « rendu autrement » — celle que l'agrégat
 * `CardRefundRequest` refuse au-delà (`refund_request_settled_reason_bounded`).
 */
export const SETTLE_REASON_MAX_LENGTH = 500;

/** Ce que dit le code de la demande ; un code inconnu se dit tel quel. */
const REASONS: Readonly<Record<string, string>> = {
  cancellation: 'annulation',
  paid_after_cancellation: 'paiement arrivé après l’annulation',
  shortfall: 'reste d’un départ incomplet',
};

/**
 * Ce qui bloque encore le reste, dit avant le clic (plan E9, § 4.5). Seules
 * les causes qu'un geste répare arrivent ici : le serveur tait les autres.
 */
export const SHORTFALL_REFUND_CAUSE_TEXT: Readonly<Record<ShortfallRefundCause, string>> = {
  already_invoiced:
    'Une facture porte déjà la commande : rendez le reste à la main, avec un avoir.',
  increase_pending:
    'Une hausse par carte est en cours : réglez-la (payée et appliquée, ou abandonnée) avant de rembourser.',
  unattributed_refund:
    'Un remboursement a été fait hors de la plateforme : rendez le reste à la main.',
  payment_not_paid: 'Un paiement par carte n’est pas encore encaissé : attendez l’encaissement.',
  not_covered:
    'Ce qui reste sur les paiements ne couvre pas le reste : relancez ou réglez autrement le remboursement arrêté d’abord.',
};

/** La clé d'intention du reste : un seul par commande. */
const SHORTFALL_SUBJECT = 'shortfall';

/** Une demande, déjà mise en forme pour le bandeau. */
interface RequestRow {
  readonly request: AdminRefundRequest;
  readonly amount: string;
  readonly reason: string;
  readonly variant: FoldCalloutVariant;
  /** Un humain doit agir : arrêtée, ou pas encore partie après un essai. */
  readonly toDo: boolean;
  /** « Rendu autrement » n'a de sens que sur une demande arrêtée. */
  readonly settleable: boolean;
}

/** La couleur dit l'issue, et `alert` quand un humain doit agir. */
const SETTLED_VARIANT: Readonly<Partial<Record<AdminRefundRequestState, FoldCalloutVariant>>> = {
  refunded: 'success',
  settled_elsewhere: 'success',
};

function rowOf(request: AdminRefundRequest): RequestRow {
  const toDo =
    request.state === 'stopped' || (request.state === 'to_issue' && request.attempts > 0);
  return {
    request,
    amount: formatCents(request.issuedCents ?? request.announcedCents),
    reason: REASONS[request.reason] ?? request.reason,
    variant: SETTLED_VARIANT[request.state] ?? (toDo ? 'alert' : 'info'),
    toDo,
    settleable: request.state === 'stopped',
  };
}

/** Le refus du dernier geste, rattaché à la demande qu'il visait. */
interface RequestError {
  readonly requestId: string;
  readonly message: string;
}

/**
 * **Le bandeau des remboursements par carte** d'une commande (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.9 ; plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §5.3, §5.5) : une ligne PAR DEMANDE — une commande en porte une par
 * paiement encaissé —, son état lu au carnet par le serveur, et ses deux
 * gestes.
 *
 * « Relancer » n'apparaît que si le serveur le dit utile (`retryable`, bail
 * compris, invisible au front) ; il n'attend pas Stripe (`202`), l'écran relit.
 * « Rendu autrement » n'apparaît que sur une demande arrêtée, et demande un
 * motif. Les deux sont désactivés sans `card_payments:write`.
 */
@Component({
  selector: 'app-order-refund-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './order-refund-banner.html',
  styleUrl: './order-refund-banner.scss',
})
export class OrderRefundBanner {
  readonly requests = input.required<readonly AdminRefundRequest[]>();
  /** La commande, pour « Rembourser le reste ». */
  readonly orderId = input.required<string>();
  /**
   * Le reste d'un départ incomplet à rembourser, lu sur l'état par le serveur
   * (`null`, ou absent d'un serveur plus ancien : pas de bouton).
   */
  readonly shortfallRefund = input<AdminShortfallRefund | null>(null);

  /** Une demande a été relancée ou notée rendue : au parent de relire le détail. */
  readonly changed = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);
  /** Une relance par intention : un double clic ne relance pas deux fois. */
  private readonly retryIntents = new GestureIntents();
  /** « Rembourser le reste » par intention : un double clic ne demande pas deux fois. */
  private readonly shortfallIntents = new GestureIntents();

  protected readonly maxLength = SETTLE_REASON_MAX_LENGTH;
  protected readonly allowed = computed(() => this.permissions.can('card_payments:write'));
  protected readonly rows = computed(() => this.requests().map(rowOf));
  protected readonly shortfall = computed(() => {
    const refund = this.shortfallRefund();
    return refund === null
      ? null
      : {
          amount: formatCents(refund.amountCents),
          blockedBy: refund.cause === null ? null : SHORTFALL_REFUND_CAUSE_TEXT[refund.cause],
        };
  });

  /** La demande dont un geste est en vol, ou `null`. */
  protected readonly saving = signal<string | null>(null);
  protected readonly error = signal<RequestError | null>(null);

  /** La demande dont la confirmation « rendu autrement » est ouverte, ou `null`. */
  protected readonly settling = signal<string | null>(null);
  protected readonly reason = signal('');
  /** Une confirmation tentée sans motif — le champ le dit alors. */
  protected readonly attempted = signal(false);

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(() => this.trimmed().length > SETTLE_REASON_MAX_LENGTH);
  protected readonly missing = computed(() => this.attempted() && this.trimmed() === '');

  protected errorOf(requestId: string): string | null {
    const error = this.error();
    return error?.requestId === requestId ? error.message : null;
  }

  protected async retry(requestId: string): Promise<void> {
    const key = this.retryIntents.keyFor(requestId);
    await this.run(requestId, () => this.api.retryRefund(requestId, key), {
      fallback: "La relance n'a pas abouti. Réessayez.",
      onSuccess: () => this.retryIntents.done(requestId),
    });
  }

  protected async refundShortfall(): Promise<void> {
    const orderId = this.orderId();
    const key = this.shortfallIntents.keyFor(SHORTFALL_SUBJECT);
    await this.run(SHORTFALL_SUBJECT, () => this.api.refundShortfall(orderId, key), {
      fallback: "Le reste n'a pas pu être remboursé. Réessayez.",
      onSuccess: () => this.shortfallIntents.done(SHORTFALL_SUBJECT),
    });
  }

  protected onSettleOpenChange(requestId: string, open: boolean): void {
    this.settling.set(open ? requestId : null);
    this.reason.set('');
    this.attempted.set(false);
  }

  protected async settle(requestId: string): Promise<void> {
    this.attempted.set(true);
    const reason = this.trimmed();
    if (reason === '' || this.tooLong()) {
      return;
    }
    await this.run(requestId, () => this.api.settleRefundElsewhere(requestId, reason), {
      fallback: "Le remboursement n'a pas pu être noté rendu. Réessayez.",
      onSuccess: () => this.onSettleOpenChange(requestId, false),
    });
  }

  private async run(
    requestId: string,
    gesture: () => Promise<void>,
    outcome: { readonly fallback: string; readonly onSuccess?: () => void },
  ): Promise<void> {
    this.saving.set(requestId);
    this.error.set(null);
    try {
      await gesture();
      outcome.onSuccess?.();
      this.changed.emit();
    } catch (caught) {
      this.error.set({ requestId, message: httpErrorMessage(caught, outcome.fallback) });
    } finally {
      this.saving.set(null);
    }
  }
}
