import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { OrderRevisionQuotePayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { OrderRevisionGateway, STALE_CHANGE_REQUEST } from '../order-revision.gateway';
import { RevisionQuote, type QuoteState } from '../revision-quote/revision-quote';

/** Un refus de l'envoi : sa phrase, et s'il faut recharger la commande. */
interface SendRefusal {
  readonly message: string;
  readonly stale: boolean;
}

/**
 * **« Votre demande »** — ce qui remplace le nouveau total sur l'écran de
 * modification quand l'heure limite est passée (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4).
 *
 * Le devis est INDICATIF (§14, décision de Hugo du 2026-10-23) : le nouveau
 * total et l'écart, aux règles de la modification, marqués « sous réserve » —
 * c'est l'équipe qui jugera la composition et recalculera en l'appliquant,
 * sur la commande telle qu'elle sera. La demande ne range aucun montant. La carte envoie la commande voulue avec
 * la révision sur laquelle elle a été composée : changée entre-temps, le
 * serveur refuse et la carte propose de recharger.
 */
@Component({
  selector: 'app-change-request-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
    FoldTextareaComponent,
    RevisionQuote,
    RouterLink,
  ],
  templateUrl: './change-request-card.html',
  styleUrl: './change-request-card.scss',
})
export class ChangeRequestCard {
  readonly orderId = input.required<string>();
  /** La commande voulue ; `null` tant qu'il manque quelque chose. */
  readonly content = input.required<OrderRevisionQuotePayload | null>();
  /** La révision sur laquelle le brouillon a été composé. */
  readonly revision = input.required<number>();
  /** Le brouillon diffère de la commande : il y a quelque chose à demander. */
  readonly changed = input.required<boolean>();
  /** Le devis indicatif de la demande, tenu par la page. */
  readonly quote = input.required<QuoteState>();
  /** Relire la commande : la demande a été composée sur une version dépassée. */
  readonly reload = output();
  /** Redemander le devis après une panne. */
  readonly retryQuote = output();

  private readonly gateway = inject(OrderRevisionGateway);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly t = inject(ClientCopyService).t;

  protected readonly c = computed(() => this.t().orders.revision);
  protected readonly r = computed(() => this.c().request);

  protected readonly message = signal('');
  protected readonly sending = signal(false);
  protected readonly refusal = signal<SendRefusal | null>(null);

  protected readonly canSend = computed(
    () => this.content() !== null && this.changed() && !this.sending(),
  );

  protected async send(): Promise<void> {
    const content = this.content();
    if (!this.canSend() || content === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    const outcome = await this.gateway.requestChange(this.orderId(), {
      change: { ...content, expectedRevision: this.revision() },
      message: this.message().trim(),
    });
    this.sending.set(false);
    if (outcome.kind === 'ok') {
      this.notify.success(this.r().requestSentToast);
      void this.router.navigate(['/mes-commandes', this.orderId()]);
      return;
    }
    this.refusal.set(
      outcome.kind === 'refused'
        ? {
            message: outcome.refusal.message || this.r().requestRefused,
            stale: outcome.refusal.code === STALE_CHANGE_REQUEST,
          }
        : { message: this.r().requestRefused, stale: false },
    );
  }
}
