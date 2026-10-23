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
import { RouterLink } from '@angular/router';
import { formatCents } from '@lfd/b2b-ui/order';
import {
  CONTACT_BOUNDS,
  type OrderChangeDetailsView,
  type OrderRevisionQuoteView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ORDER_REVISION_CHANGE } from '../../../shared/journal/values/orders-values';
import { CustomerRequestsInbox } from '../customer-requests-inbox.store';
import { CustomerRequestsService } from '../customer-requests.service';

/** L'écart, tel que le serveur le calcule — ou la phrase de la règle qui refuse. */
type QuoteState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: OrderRevisionQuoteView }
  | { readonly kind: 'refused'; readonly message: string };

/**
 * **Les détails d'une demande de modification de commande** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4) — la commande,
 * l'écart que la modification demandée donnerait (le devis de révision de
 * l'équipe : total actuel, nouveau total, ce qui change, les lignes), puis
 * « Appliquer » ou « Refuser » avec un mot au client.
 *
 * Le devis est relu au serveur à l'ouverture : c'est LA règle de la
 * modification qui juge. Inscrite au plan entre-temps, ou réglée par carte, il
 * refuse avec sa phrase, montrée à la place de l'écart — « Appliquer » est
 * alors fermé, « Refuser » reste. Modifiée ailleurs depuis la demande, le
 * devis le dit : appliquer serait refusé (R7).
 *
 * Les détails répondent eux-mêmes, puis le disent à la boîte
 * (`CustomerRequestsInbox.noteAnswered`), qui relit sa liste.
 */
@Component({
  selector: 'app-order-change-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
    FoldTextareaComponent,
    RouterLink,
  ],
  templateUrl: './order-change-details.html',
  styleUrl: './order-change-details.scss',
})
export class OrderChangeDetails {
  readonly requestId = input.required<string>();
  readonly details = input.required<OrderChangeDetailsView>();

  private readonly api = inject(CustomerRequestsService);
  private readonly inbox = inject(CustomerRequestsInbox);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxLength = CONTACT_BOUNDS.changeRefusal;
  protected readonly canWrite = computed(() => this.permissions.can('b2b_contact:write'));
  /** En attente de réponse, et la commande toujours citée (pas anonymisée). */
  protected readonly pending = computed(
    () => this.details().decision === null && this.details().orderId !== null,
  );

  protected readonly quote = signal<QuoteState>({ kind: 'loading' });
  protected readonly ready = computed(() => {
    const state = this.quote();
    return state.kind === 'ready' ? state.view : null;
  });
  protected readonly quoteRefusal = computed(() => {
    const state = this.quote();
    return state.kind === 'refused' ? state.message : null;
  });
  /** La commande a bougé depuis la demande : « Appliquer » serait refusé (R7). */
  protected readonly stale = computed(() => {
    const view = this.ready();
    return view !== null && view.revision !== this.details().baseRevision;
  });
  protected readonly difference = computed(() => {
    const cents = this.ready()?.differenceCents ?? 0;
    return cents === 0 ? 'Aucun' : `${cents > 0 ? '+' : '−'} ${formatCents(Math.abs(cents))}`;
  });
  protected readonly changes = computed(() =>
    (this.ready()?.changes ?? []).map((change) => ORDER_REVISION_CHANGE.labels[change] ?? change),
  );

  protected readonly refusing = signal(false);
  protected readonly reason = signal('');
  protected readonly busy = signal<'apply' | 'refuse' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly cents = formatCents;

  constructor() {
    effect(() => {
      const id = this.requestId();
      const pending = this.pending();
      untracked(() => {
        if (pending) void this.loadQuote(id);
      });
    });
  }

  protected async apply(): Promise<void> {
    if (this.busy() !== null || this.ready() === null || this.stale()) return;
    this.busy.set('apply');
    this.error.set(null);
    try {
      const { revision } = await this.api.applyOrderChange(this.requestId());
      this.notify.success(`Modification appliquée : la commande passe en révision ${revision}.`);
      this.inbox.noteAnswered();
    } catch (error) {
      this.error.set(httpErrorMessage(error, "La modification n'a pas pu être appliquée."));
    } finally {
      this.busy.set(null);
    }
  }

  protected async refuse(): Promise<void> {
    const reason = this.reason().trim();
    if (this.busy() !== null || reason === '') return;
    this.busy.set('refuse');
    this.error.set(null);
    try {
      await this.api.refuseOrderChange(this.requestId(), reason);
      this.notify.success('Demande refusée : le client est prévenu par e-mail.');
      this.inbox.noteAnswered();
    } catch (error) {
      this.error.set(httpErrorMessage(error, "Le refus n'a pas pu être enregistré."));
    } finally {
      this.busy.set(null);
    }
  }

  private async loadQuote(id: string): Promise<void> {
    this.quote.set({ kind: 'loading' });
    try {
      this.quote.set({ kind: 'ready', view: await this.api.orderChangeQuote(id) });
    } catch (error) {
      this.quote.set({
        kind: 'refused',
        message: httpErrorMessage(error, "L'écart n'a pas pu être calculé."),
      });
    }
  }
}
