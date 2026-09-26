import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import {
  FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
  FoldButtonComponent,
  type FoldInlineConfirmLabels,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { ClientChrome } from '../../client-chrome.service';
import { type AbandonOutcome, ClientOrderAbandon } from '../../client-order-abandon.service';
import { ClientOrders } from '../../client-orders.service';
import { ClientWorkspace } from '../../client-workspace.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { NotifyService } from '../../../notify.service';
import { StripeLoader } from '../../stripe-loader.service';

/** L'écran ne peut être que dans un de ces états, et il n'en montre qu'un. */
type Phase = 'loading' | 'ready' | 'paying' | 'unavailable' | 'closed';

/**
 * **Le règlement** — l'étape qui manquait entre le panier et la confirmation.
 *
 * 🔴 Le serveur créait une intention Stripe à chaque commande client et la
 * rendait dans `POST /orders` ; personne ne la lisait. La commande tombait en
 * `pending`, l'écran suivant annonçait « c'est réglé », et rien n'entrait en
 * caisse. Cet écran est la case manquante.
 *
 * ## Pourquoi une ROUTE, et pas un panneau dans le panier
 *
 * Parce que la commande **existe déjà** quand on arrive ici. Un panneau dans le
 * panier laisserait croire qu'on peut revenir en arrière et corriger ; on ne
 * peut pas, la commande est passée et le panier est vide. Une adresse propre
 * porte l'identifiant, donc elle survit à un rechargement et se rouvre plus
 * tard — ce qu'un panneau ne fait pas.
 *
 * ## Ce que cet écran n'affirme pas
 *
 * Il ne décide pas que la commande est payée : Stripe confirme au navigateur,
 * et c'est le **webhook** serveur qui écrit `paid` dans notre base. Un
 * `succeeded` obtenu ici donne le droit d'afficher « réglé », rien de plus.
 *
 * ## Quitter sans payer est un ABANDON, et il se dit
 *
 * 🔴 Le bouton a dit « Régler plus tard », puis « Je règle depuis « Mes
 * commandes » » : deux promesses de délai pour un geste — `later()` — qui ne
 * marquait rien et menait à la confirmation d'une commande que personne ne
 * payait. Depuis le 2026-09-26 (lot 8 du plan
 * `documentation/order/plan-abandon-du-reglement.md`), la sortie s'appelle
 * « Abandonner ma commande », dit sa conséquence AVANT d'agir, TENTE
 * `POST /orders/:id/abandon`, et navigue **quoi qu'il arrive**.
 *
 * Bloquer la sortie retiendrait quelqu'un devant un formulaire de carte pour
 * une commande déjà écrite — y compris en phase `unavailable`, quand Stripe ne
 * s'est pas chargé. L'annulation est donc ce qu'on tente, jamais une condition
 * pour partir : si elle échoue, la clôture de la journée balaiera la commande.
 *
 * Seule exception à « vers la boutique » : de l'argent pris ou en route
 * (`already_paid`, `payment_in_progress`) mène à la confirmation — la dire
 * annulée serait faux.
 *
 * ⚠️ Le vrai différé s'appelle **« au compte »** (`OrderSettlement.account`),
 * il se décide AU PANIER, et il ne passe jamais par ici : une commande au
 * compte revient avec `settlement: 'later'` et file à la confirmation.
 */
@Component({
  selector: 'app-reglement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInlineConfirmComponent],
  templateUrl: './reglement-page.html',
  styleUrl: './reglement-page.scss',
})
export class ReglementPage {
  private readonly route = inject(ActivatedRoute);
  private readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly orders = inject(ClientOrders);
  private readonly stripeLoader = inject(StripeLoader);
  private readonly notify = inject(NotifyService);
  private readonly abandoning = inject(ClientOrderAbandon);
  private readonly workspace = inject(ClientWorkspace);

  protected readonly t = inject(ClientCopyService).t;

  /** L'identifiant lu du segment de route (l'app ne lie pas les inputs de route). */
  private readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;

  private readonly mountRef = viewChild.required<ElementRef<HTMLDivElement>>('mount');

  protected readonly phase = signal<Phase>('loading');
  protected readonly amountCents = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  /** L'abandon est parti : la confirmation reste ouverte, en attente. */
  protected readonly leaving = signal(false);
  protected readonly confirmOpen = signal(false);

  /**
   * Pro ou particulier, lu de l'ESPACE courant : le contrat de l'écran ne porte
   * pas la clientèle, et le serveur la déduit de la société de la commande,
   * passée dans cet espace-ci. Un pro qui abandonne garde une intention vivante
   * jusqu'à la clôture (Q8, a) : lui dire « annulée » serait faux.
   */
  private readonly pro = computed(() => this.workspace.company() !== null);

  protected readonly abandonWarning = computed(() =>
    this.pro() ? this.t().pay.abandonWarningPro : this.t().pay.abandonWarning,
  );

  /** Les mots de la confirmation — fold parle anglais par défaut. */
  protected readonly abandonLabels = computed<FoldInlineConfirmLabels>(() => {
    const pay = this.t().pay;
    return {
      ...FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
      confirm: pay.abandonConfirm,
      cancel: pay.abandonKeep,
      cancelAria: pay.abandonKeep,
      busy: pay.abandonBusy,
      group: pay.abandon,
    };
  });

  /** La commande de ce règlement, si le navigateur la connaît encore. */
  private readonly order = computed(() => this.orders.all().find((row) => row.id === this.id()));

  /** La référence humaine, à défaut l'identifiant — on ne laisse pas la phrase à trou. */
  protected readonly lead = computed(() =>
    fill(this.t().pay.lead, { ref: this.order()?.reference ?? this.id() }),
  );

  protected readonly amountLabel = computed(() => {
    const cents = this.amountCents();
    return cents === null ? '' : formatCents(cents);
  });

  protected readonly submitLabel = computed(() =>
    this.phase() === 'paying'
      ? this.t().pay.submitting
      : fill(this.t().pay.submit, { total: this.amountLabel() }),
  );

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerPay);
    // Aucune flèche de retour : derrière cet écran il y a un panier vide et une
    // commande déjà passée. La sortie est l'abandon, qui dit ce qu'il fait.
    this.chrome.back.set(null);
    // Navigateur uniquement : `afterNextRender` ne tourne pas en SSR, et le nœud
    // de montage du Payment Element existe alors dans le DOM.
    afterNextRender(() => {
      void this.prepare();
    });
  }

  /**
   * Va chercher de quoi payer, puis monte le Payment Element.
   *
   * Une commande qui n'attend aucun règlement en ligne — déjà réglée, portée au
   * compte, annulée, ou dont l'intention est close — n'est pas une panne : on le
   * dit ICI, et on renvoie vers « Mes commandes », qui lit l'état au serveur.
   *
   * 🔴 On filait à la confirmation. Or elle lit l'état « dû » gardé dans le
   * navigateur, et proposait donc « Régler maintenant » pour une commande que le
   * serveur venait de déclarer non réglable — une boucle sans sortie
   * (confirmation ↔ règlement), apparue avec le refus des commandes annulées et
   * des intentions closes (lot 7, corrigé le 2026-09-26). Seul un CHARGEMENT
   * raté est une panne, et il se dit sans faire disparaître la commande.
   */
  private async prepare(): Promise<void> {
    const payment = await this.orders.paymentFor(this.id());
    if (payment === null) {
      this.phase.set('closed');
      this.error.set(this.t().pay.closed);
      return;
    }
    this.amountCents.set(payment.amountCents);
    const stripe = await this.stripeLoader.load(payment.publishableKey);
    if (stripe === null) {
      this.unavailable();
      return;
    }
    try {
      this.stripe = stripe;
      this.elements = stripe.elements({ clientSecret: payment.clientSecret });
      this.elements.create('payment').mount(this.mountRef().nativeElement);
      this.phase.set('ready');
    } catch {
      this.unavailable();
    }
  }

  /**
   * Confirme le paiement.
   *
   * `redirect: 'if_required'` garde le client dans l'app pour une carte simple ;
   * seuls les moyens qui l'exigent — 3-D Secure — provoquent une redirection.
   */
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
      // Le message de Stripe est écrit pour le porteur de la carte — « fonds
      // insuffisants », « code de sécurité invalide ». Le remplacer par le
      // nôtre lui retirerait la seule information qui lui permet de corriger.
      this.error.set(result.error.message ?? this.t().pay.refused);
      this.phase.set('ready');
      return;
    }
    if (result.paymentIntent?.status !== 'succeeded') {
      this.error.set(this.t().pay.failed);
      this.phase.set('ready');
      return;
    }
    this.orders.markPaid(this.id());
    this.notify.success(this.t().pay.accepted);
    void this.toConfirmation();
  }

  /**
   * **Abandonner**, une fois la conséquence confirmée.
   *
   * L'appel est TENTÉ et ne retient jamais : quelle que soit l'issue — serveur
   * muet, Stripe injoignable, refus —, on part. Seul le message change, et la
   * destination quand le paiement a abouti.
   */
  protected async abandon(): Promise<void> {
    if (this.leaving()) {
      return;
    }
    this.leaving.set(true);
    const outcome = await this.abandoning.abandon(this.id());
    this.announce(outcome);
    this.confirmOpen.set(false);
    void (outcome === 'settled' ? this.toConfirmation() : this.router.navigate(['/boutique']));
  }

  /** Ce qui est VRAI après la tentative — jamais « annulée » sans que le serveur l'ait écrit. */
  private announce(outcome: AbandonOutcome): void {
    const pay = this.t().pay;
    if (outcome === 'settled') {
      this.notify.info(pay.abandonSettled);
    } else if (outcome === 'abandoned' && !this.pro()) {
      this.notify.success(pay.abandoned);
    } else {
      this.notify.info(pay.abandonPending);
    }
  }

  /** La sortie d'une commande qui ne se règle plus ici : l'état réel est au serveur. */
  protected toOrders(): void {
    void this.router.navigate(['/mes-commandes']);
  }

  private unavailable(): void {
    this.phase.set('unavailable');
    this.error.set(this.t().pay.unavailable);
  }

  private toConfirmation(): Promise<boolean> {
    return this.router.navigate(['/confirmation-de-commande']);
  }
}
