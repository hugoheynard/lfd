import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import type { PayLinkView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { ClientChrome } from '../../client-chrome.service';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { payLinkCopy } from '../../copy/screens/pay-link.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { formatCents } from '../../format-money';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { CardCollector, type MountedCollection } from '../../payment-collection/card-collector';
import { PayLinkGateway } from '../pay-link.gateway';

/**
 * L'écran n'est que dans un de ces états :
 * - `not_found` — jeton inconnu ou révoqué, sans dire lequel ;
 * - `settled` / `cancelled` — le sujet ne veut plus être payé ;
 * - `renew` — le prestataire ne reprend plus ce paiement, le lien est à refaire ;
 * - `unavailable` — une panne : le lien n'est pas en cause, on peut recharger ;
 * - `ready` — le formulaire est monté (un refus y revient, avec sa phrase) ;
 * - `paid` — le prestataire a encaissé ; le webhook fera foi.
 */
export type PayLinkPhase =
  | 'loading'
  | 'not_found'
  | 'settled'
  | 'cancelled'
  | 'renew'
  | 'unavailable'
  | 'ready'
  | 'paying'
  | 'paid';

type Payable = Extract<PayLinkView, { readonly payable: true }>;

/**
 * **`/payer/:jeton`** — la page publique d'un lien de paiement (doc
 * `documentation/payment/les-liens-de-paiement.md`). Le comptable d'un client y paie sans compte : ni garde, ni espace, ni
 * menu.
 *
 * Le jeton vient de l'adresse de la page ; il ne part que dans le CORPS des
 * deux `POST` (`PayLinkGateway`). L'intention naît à l'ouverture, au navigateur
 * seulement (`afterNextRender`) : le rendu serveur ne montre que le chargement.
 *
 * La page n'affirme pas que la dette est réglée : un `succeeded` du prestataire
 * donne le droit de dire « paiement reçu », et c'est le webhook qui l'écrit.
 */
@Component({
  selector: 'app-pay-link-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './pay-link-page.html',
  styleUrl: './pay-link-page.scss',
})
export class PayLinkPage {
  private readonly gateway = inject(PayLinkGateway);
  private readonly collector = inject(CardCollector);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = screenCopy('payLink', payLinkCopy);
  protected readonly phase = signal<PayLinkPhase>('loading');
  protected readonly view = signal<Payable | null>(null);
  /** Le refus du dernier essai — la phrase du prestataire quand il en donne une. */
  protected readonly error = signal<string | null>(null);

  private readonly token = this.route.snapshot.paramMap.get('jeton') ?? '';
  private collection: MountedCollection | null = null;
  private readonly mountRef = viewChild.required<ElementRef<HTMLDivElement>>('mount');

  protected readonly amount = computed(() => {
    const view = this.view();
    return view === null ? '' : formatCents(view.amountCents);
  });

  protected readonly dueOn = computed(() => {
    const day = this.view()?.dueOn ?? null;
    if (day === null) {
      return null;
    }
    const instant = new Date(`${day}T12:00:00.000Z`);
    return Number.isNaN(instant.getTime())
      ? day
      : new Intl.DateTimeFormat(this.locale(), {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(instant);
  });

  protected readonly submitLabel = computed(() =>
    this.phase() === 'paying'
      ? this.c().submitting
      : fill(this.c().submit, { amount: this.amount() }),
  );

  /** Ce que la région vivante annonce à chaque changement de phase. */
  protected readonly status = computed(() => {
    const c = this.c();
    switch (this.phase()) {
      case 'loading':
        return c.loading;
      case 'not_found':
        return c.notFoundTitle;
      case 'settled':
        return c.settledTitle;
      case 'cancelled':
        return c.cancelledTitle;
      case 'renew':
        return c.renewTitle;
      case 'unavailable':
        return c.unavailableTitle;
      case 'ready':
        return '';
      case 'paying':
        return c.submitting;
      case 'paid':
        return `${c.paidTitle}. ${c.paidSubtitle}`;
    }
  });

  constructor() {
    const chrome = inject(ClientChrome);
    effect(() => chrome.kicker.set(this.c().title));
    chrome.back.set(null);
    // Pas d'espace client : le payeur n'a pas de compte, et rien ici n'y mène.
    chrome.menu.set(false);

    // La page porte un jeton : elle ne s'indexe pas.
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => meta.removeTag('name="robots"'));

    effect(() => {
      const locale = this.locale();
      this.collection?.setLocale(locale);
    });
    afterNextRender(() => {
      void this.load();
    });
  }

  /** Lit le lien, puis demande de quoi payer et monte le formulaire. */
  protected async load(): Promise<void> {
    this.phase.set('loading');
    this.error.set(null);
    this.view.set(null);
    const read = await this.gateway.view(this.token);
    if (read.kind !== 'ready') {
      this.phase.set(read.kind === 'not_found' ? 'not_found' : 'unavailable');
      return;
    }
    if (!read.view.payable) {
      this.phase.set(read.view.reason);
      return;
    }
    this.view.set(read.view);
    const asked = await this.gateway.intent(this.token);
    switch (asked.kind) {
      case 'not_found':
        this.phase.set('not_found');
        return;
      case 'not_payable':
        // Réglé ou annulé entre les deux lectures : la vue dit lequel. Une
        // seule relecture — si elle se contredit encore, c'est une panne.
        await this.reread();
        return;
      case 'closed':
        this.phase.set('renew');
        return;
      case 'failed':
        this.phase.set('unavailable');
        return;
      case 'ready':
        break;
    }
    try {
      this.collection = await this.collector.mount(
        asked.intent.collection,
        this.mountRef().nativeElement,
        this.locale(),
      );
    } catch {
      this.collection = null;
    }
    this.phase.set(this.collection === null ? 'unavailable' : 'ready');
  }

  private async reread(): Promise<void> {
    const read = await this.gateway.view(this.token);
    if (read.kind === 'ready' && !read.view.payable) {
      this.view.set(null);
      this.phase.set(read.view.reason);
      return;
    }
    this.phase.set(read.kind === 'not_found' ? 'not_found' : 'unavailable');
  }

  protected async pay(): Promise<void> {
    const collection = this.collection;
    if (collection === null || this.phase() !== 'ready') {
      return;
    }
    this.phase.set('paying');
    this.error.set(null);
    // Payeur anonyme : aucun nom ne part au prestataire (le-pointage-stripe, § 7).
    const outcome = await collection.collect();
    switch (outcome.kind) {
      case 'redirected':
        // Le client part chez le prestataire : la page reste telle quelle.
        return;
      case 'refused':
        // La phrase du prestataire est écrite pour le porteur de la carte.
        this.error.set(outcome.message ?? this.c().refused);
        this.phase.set('ready');
        return;
      case 'unfinished':
        this.error.set(this.c().unfinished);
        this.phase.set('ready');
        return;
      case 'succeeded':
        this.phase.set('paid');
        return;
    }
  }
}
