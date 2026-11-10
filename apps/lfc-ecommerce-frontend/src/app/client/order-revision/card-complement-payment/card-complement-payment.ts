import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { CardComplementPaymentView } from '@lfd/contracts';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { ClientLocale, type LocaleCode } from '../../client-locale.service';
import { PAYMENT_ELEMENT_OPTIONS } from '../../commande/payment-element-options';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { StripeLoader } from '../../stripe-loader.service';
import {
  CARD_INCREASE_JUST_PAID,
  CARD_INCREASE_NOTHING_TO_PAY,
  CARD_INCREASE_PROVIDER_UNAVAILABLE,
  OrderRevisionGateway,
} from '../order-revision.gateway';

/** La relecture de la commande après le paiement : toutes les 2 s (plan S2, §2.8)… */
export const APPLIED_POLL_MS = 2_000;
/** …bornée à 30 s, puis « nous finalisons ». */
export const APPLIED_POLL_LIMIT_MS = 30_000;

const SECOND_MS = 1_000;
const SECONDS_PER_MINUTE = 60;

/**
 * L'écran n'est que dans un de ces états : le formulaire se prépare, attend la
 * carte, confirme, la commande se relit (`confirming`), la relecture a passé
 * sa borne (`finishing`), le délai est passé, ou Stripe ne s'est pas chargé.
 */
type Phase =
  'loading' | 'ready' | 'paying' | 'confirming' | 'finishing' | 'expired' | 'unavailable';

/**
 * **Payer le complément d'une hausse, sur l'écran de modification** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5, §2.8).
 *
 * Le Payment Element se monte comme sur la page de règlement — le même
 * chargeur (`StripeLoader`), les mêmes options, la langue de la boutique —,
 * avec le `clientSecret` du complément. Le navigateur n'affirme rien : c'est
 * le webhook qui encaisse, puis l'exécuteur qui applique. Après un
 * `succeeded`, l'écran relit donc la commande toutes les 2 s jusqu'à voir sa
 * révision monter ; au-delà de 30 s, il dit que la modification se finalise
 * et qu'un e-mail suivra.
 *
 * Le délai restant se lit de `expiresAt`. « Annuler la modification »
 * abandonne le complément : la commande reste telle qu'elle était.
 */
@Component({
  selector: 'app-card-complement-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './card-complement-payment.html',
  styleUrl: './card-complement-payment.scss',
})
export class CardComplementPayment {
  readonly orderId = input.required<string>();
  readonly complement = input.required<CardComplementPaymentView>();
  /** La révision de la commande avant la hausse : appliquée, elle monte. */
  readonly baseRevision = input.required<number>();

  /** La modification est appliquée : la page l'annonce et rouvre la commande. */
  readonly applied = output();
  /** Le complément est abandonné : la page reprend la commande telle qu'elle est. */
  readonly abandoned = output();

  private readonly gateway = inject(OrderRevisionGateway);
  private readonly stripeLoader = inject(StripeLoader);
  private readonly locale = inject(ClientLocale).current;
  private readonly t = inject(ClientCopyService).t;

  protected readonly c = computed(() => this.t().orders.revision.card);

  private readonly mountRef = viewChild.required<ElementRef<HTMLDivElement>>('mount');

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private mountedLocale: LocaleCode | null = null;

  protected readonly phase = signal<Phase>('loading');
  /** Le refus de la carte (phrase de Stripe) ou de l'abandon (la nôtre). */
  protected readonly error = signal<string | null>(null);
  protected readonly cancelling = signal(false);
  private readonly now = signal(Date.now());

  private ticker: ReturnType<typeof setInterval> | null = null;
  private poller: ReturnType<typeof setTimeout> | null = null;

  protected readonly amount = computed(() => formatCents(this.complement().complementCents));
  protected readonly lead = computed(() => fill(this.c().payLead, { amount: this.amount() }));
  protected readonly payLabel = computed(() =>
    this.phase() === 'paying'
      ? this.c().payingCta
      : fill(this.c().payCta, { amount: this.amount() }),
  );

  /** Les millisecondes qui restent pour payer ; jamais négatives. */
  private readonly remainingMs = computed(() =>
    Math.max(0, new Date(this.complement().expiresAt).getTime() - this.now()),
  );

  /** « Il vous reste 12:30 pour payer » — seulement tant qu'on peut encore payer. */
  protected readonly remaining = computed(() => {
    const phase = this.phase();
    if (phase !== 'ready' && phase !== 'loading') {
      return null;
    }
    const seconds = Math.ceil(this.remainingMs() / SECOND_MS);
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
    return fill(this.c().remaining, { time: `${minutes}:${rest}` });
  });

  /** On annule tant que rien n'est parti chez Stripe ni appliqué. */
  protected readonly cancellable = computed(() => {
    const phase = this.phase();
    return phase === 'ready' || phase === 'loading' || phase === 'unavailable';
  });

  constructor() {
    effect(() => {
      const locale = this.locale();
      if (this.elements !== null && this.mountedLocale !== locale) {
        this.mountedLocale = locale;
        this.elements.update({ locale });
      }
    });
    // Le délai passé ferme le formulaire : la modification est abandonnée.
    effect(() => {
      if (this.remainingMs() === 0 && (this.phase() === 'ready' || this.phase() === 'loading')) {
        this.phase.set('expired');
      }
    });
    afterNextRender(() => {
      this.ticker = setInterval(() => this.now.set(Date.now()), SECOND_MS);
      void this.prepare();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.ticker !== null) {
        clearInterval(this.ticker);
      }
      if (this.poller !== null) {
        clearTimeout(this.poller);
      }
    });
  }

  private async prepare(): Promise<void> {
    const { publishableKey, clientSecret } = this.complement();
    const stripe = await this.stripeLoader.load(publishableKey);
    if (stripe === null) {
      this.settleLoading('unavailable');
      return;
    }
    try {
      this.stripe = stripe;
      const locale = this.locale();
      this.mountedLocale = locale;
      this.elements = stripe.elements({ clientSecret, locale });
      this.elements.create('payment', PAYMENT_ELEMENT_OPTIONS).mount(this.mountRef().nativeElement);
      this.settleLoading('ready');
    } catch {
      this.settleLoading('unavailable');
    }
  }

  /**
   * La fin du chargement ne remplace qu'un chargement : le délai a pu passer
   * pendant que Stripe se montait, et « délai écoulé » l'emporte alors sur
   * « prêt » comme sur « indisponible » (régression vue en CI le 2026-11-10 :
   * un montage de Stripe en échec rouvrait l'écran d'un délai déjà passé).
   */
  private settleLoading(next: 'ready' | 'unavailable'): void {
    if (this.phase() === 'loading') {
      this.phase.set(next);
    }
  }

  /** `redirect: 'if_required'` : une carte simple reste ici, seul 3-D Secure redirige. */
  protected async pay(): Promise<void> {
    const stripe = this.stripe;
    const elements = this.elements;
    if (stripe === null || elements === null || this.phase() !== 'ready') {
      return;
    }
    this.phase.set('paying');
    this.error.set(null);
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (result.error !== undefined) {
      // La phrase de Stripe est écrite pour le porteur : elle lui dit quoi corriger.
      this.error.set(result.error.message ?? this.c().cardRefused);
      this.phase.set('ready');
      return;
    }
    if (result.paymentIntent?.status !== 'succeeded') {
      this.error.set(this.c().payFailed);
      this.phase.set('ready');
      return;
    }
    this.awaitApplied();
  }

  protected async cancel(): Promise<void> {
    if (this.cancelling() || !this.cancellable()) {
      return;
    }
    this.cancelling.set(true);
    this.error.set(null);
    const outcome = await this.gateway.abandonComplement(this.orderId());
    this.cancelling.set(false);
    const code = outcome.kind === 'refused' ? outcome.refusal.code : null;
    if (outcome.kind === 'ok' || code === CARD_INCREASE_NOTHING_TO_PAY) {
      this.abandoned.emit();
      return;
    }
    if (code === CARD_INCREASE_JUST_PAID) {
      // Payé entre-temps : la modification suit son cours, on la regarde s'appliquer.
      this.awaitApplied();
      return;
    }
    const said = outcome.kind === 'refused' ? outcome.refusal.message : '';
    this.error.set(
      code === CARD_INCREASE_PROVIDER_UNAVAILABLE || said === ''
        ? this.c().providerUnavailable
        : said,
    );
  }

  /** Relit la commande toutes les 2 s, bornée à 30 s, jusqu'à voir la révision monter. */
  private awaitApplied(): void {
    this.phase.set('confirming');
    const deadline = Date.now() + APPLIED_POLL_LIMIT_MS;
    const check = async (): Promise<void> => {
      const order = await this.gateway.order(this.orderId());
      if (order !== null && order.revision > this.baseRevision()) {
        this.applied.emit();
        return;
      }
      if (Date.now() + APPLIED_POLL_MS > deadline) {
        this.phase.set('finishing');
        return;
      }
      this.poller = setTimeout(() => void check(), APPLIED_POLL_MS);
    };
    this.poller = setTimeout(() => void check(), APPLIED_POLL_MS);
  }
}
