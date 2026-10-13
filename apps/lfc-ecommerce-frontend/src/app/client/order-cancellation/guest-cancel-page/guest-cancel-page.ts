import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { GuestOrderCancellationView } from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { AuthFacade } from '../../../auth/auth.facade';
import { ClientChrome } from '../../client-chrome.service';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { formatCents } from '../../format-money';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ContactDialog } from '../../shop/contact-dialog/contact-dialog';
import { CancelOrderForm } from '../cancel-order-form/cancel-order-form';
import {
  type CancelReason,
  type GuestLink,
  outcomeSentence,
  parseGuestFragment,
  refusalSentence,
} from '../cancellation-wording';
import { OrderCancellationGateway } from '../order-cancellation.gateway';

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly view: GuestOrderCancellationView };

/**
 * **`/annuler`** — la page d'annulation de l'INVITÉ (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.4,
 * C6.8).
 *
 * 🔴 Le jeton voyage dans le FRAGMENT (`/annuler#<orderId>.<jeton>`, S7) : un
 * navigateur ne l'envoie jamais, donc ni le rendu serveur, ni la passerelle,
 * ni un journal ne le voient. Le serveur rend cette page en chargement ; c'est
 * le navigateur qui lit le fragment et l'envoie dans le CORPS d'un `POST`.
 *
 * 🔴 **Jamais d'annulation au chargement** : les scanners de liens des
 * messageries suivent chaque lien d'un courriel. La page LIT, et seul le
 * bouton de la confirmation annule.
 *
 * Le lien ne cesse jamais de marcher tant qu'il est valide : une commande qui
 * ne s'annule plus se montre quand même, avec la raison et la boutique.
 */
@Component({
  selector: 'app-guest-cancel-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CancelOrderForm,
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
  templateUrl: './guest-cancel-page.html',
  styleUrl: './guest-cancel-page.scss',
})
export class GuestCancelPage {
  private readonly gateway = inject(OrderCancellationGateway);
  private readonly panels = inject(FoldPanelHostService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = screenCopy('orderCancel', orderCancelCopy);
  protected readonly state = signal<PageState>({ kind: 'loading' });
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** La commande vient d'être annulée ici : le bandeau, au-dessus de l'état relu. */
  protected readonly done = signal(false);

  private link: GuestLink | null = null;

  protected readonly view = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.view : null;
  });

  protected readonly greeting = computed(() => {
    const view = this.view();
    return view === null || view.firstName.trim() === ''
      ? ''
      : fill(this.c().guestGreeting, { name: view.firstName });
  });

  protected readonly mode = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const copy = this.c();
    const fulfillment = view.fulfillment;
    if (fulfillment.method === 'pickup') {
      return fulfillment.pickupLabel === null
        ? copy.guestPickupNoPlace
        : fill(copy.guestPickup, { place: fulfillment.pickupLabel });
    }
    return fulfillment.city === null
      ? copy.guestDeliveryNoCity
      : fill(copy.guestDelivery, { city: fulfillment.city });
  });

  protected readonly day = computed(() => {
    const day = this.view()?.requestedFor ?? null;
    if (day === null) {
      return null;
    }
    const instant = new Date(`${day}T12:00:00.000Z`);
    return Number.isNaN(instant.getTime())
      ? day
      : new Intl.DateTimeFormat(this.locale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(instant);
  });

  protected readonly total = computed(() => {
    const view = this.view();
    return view === null ? '' : formatCents(view.totalCents);
  });

  protected readonly cancellable = computed(() => {
    const view = this.view();
    return view !== null && view.cancellability.cancellable ? view.cancellability : null;
  });

  /** Pourquoi elle ne s'annule plus — toujours dit ici, avec la boutique. */
  protected readonly reason = computed(() => {
    const view = this.view();
    if (view === null || view.cancellability.cancellable) {
      return null;
    }
    const { code, until } = view.cancellability;
    return refusalSentence(code, until, this.locale(), this.c());
  });

  constructor() {
    const chrome = inject(ClientChrome);
    const auth = inject(AuthFacade);
    effect(() => chrome.kicker.set(this.c().guestTitle));
    chrome.back.set(null);
    chrome.bell.set(null);
    effect(() => chrome.menu.set(auth.isAuthenticated()));
    // Le fragment n'existe que dans le navigateur : le serveur rend le chargement.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.link = parseGuestFragment(this.route.snapshot.fragment);
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    if (this.link === null) {
      this.state.set({ kind: 'not_found' });
      return;
    }
    this.state.set({ kind: 'loading' });
    const result = await this.gateway.guestView(this.link);
    this.state.set(result.kind === 'ready' ? { kind: 'ready', view: result.view } : result);
  }

  protected async confirm(reason: CancelReason): Promise<void> {
    const link = this.link;
    if (link === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    const outcome = await this.gateway.guestConfirm(link, reason);
    this.busy.set(false);
    switch (outcome.kind) {
      case 'done':
        this.done.set(true);
        await this.load();
        return;
      case 'not_found':
        this.state.set({ kind: 'not_found' });
        return;
      case 'refused': {
        const until = this.cancellable()?.until ?? null;
        this.refusal.set(outcomeSentence(outcome, until, this.locale(), this.c()));
        return;
      }
    }
  }

  /** « Garder ma commande » : rien ne part, on rentre à l'accueil. */
  protected keep(): void {
    void this.router.navigate(['/bienvenue']);
  }

  protected contact(): void {
    ContactDialog.open(this.panels);
  }
}
