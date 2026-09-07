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

import { ClientChrome } from '../../client-chrome.service';
import { ClientOrders } from '../../client-orders.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { NotifyService } from '../../../notify.service';
import { StripeLoader } from '../../stripe-loader.service';

/** L'écran ne peut être que dans un de ces états, et il n'en montre qu'un. */
type Phase = 'loading' | 'ready' | 'paying' | 'unavailable';

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
 * ## Quitter sans payer est une SORTIE, pas un échec
 *
 * « Régler plus tard » mène à la confirmation, qui dira alors la vérité — la
 * commande est enregistrée, le règlement reste dû. Bloquer la sortie retiendrait
 * quelqu'un devant un formulaire de carte pour une commande déjà écrite.
 */
@Component({
  selector: 'app-reglement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    // commande déjà passée. La sortie est « régler plus tard », qui mène à la
    // confirmation — donc en avant, pas en arrière.
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
   * compte, ou qu'on ne peut plus lire — n'est pas une panne : on file à la
   * confirmation, qui porte l'état réel. Seul un CHARGEMENT raté est une panne,
   * et il se dit sans faire disparaître la commande.
   */
  private async prepare(): Promise<void> {
    const payment = await this.orders.paymentFor(this.id());
    if (payment === null) {
      void this.toConfirmation();
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

  /** Sortie assumée : la commande reste, le règlement aussi. */
  protected later(): void {
    void this.toConfirmation();
  }

  private unavailable(): void {
    this.phase.set('unavailable');
    this.error.set(this.t().pay.unavailable);
  }

  private toConfirmation(): Promise<boolean> {
    return this.router.navigate(['/nouvelle-commande/confirmee']);
  }
}
