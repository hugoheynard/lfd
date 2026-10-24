import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CustomerOrderDetailView } from '@lfd/contracts';
import { instantToLocal } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';
import { map } from 'rxjs/operators';

import { NotifyService } from '../../../notify.service';
import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { serviceDayLabel } from '../../format-day';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { OrderDoors } from '../../shop/order-doors';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { STALE_REVISION, OrderRevisionGateway } from '../order-revision.gateway';
import {
  contentOf,
  draftOf,
  type RevisionDraft,
  withAdded,
  withoutLine,
  withQuantity,
} from '../revision-draft';
import { ChangeRequestCard } from '../change-request-card/change-request-card';
import { RevisionQuote, type QuoteState } from '../revision-quote/revision-quote';

/** Le délai de calme après le dernier geste avant de redemander le devis. */
const QUOTE_DELAY_MS = 300;

type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly order: CustomerOrderDetailView };

/** Un refus de la validation : sa phrase, et s'il faut recharger (R7). */
interface SubmitRefusal {
  readonly message: string;
  readonly stale: boolean;
}

/**
 * **Modifier une commande passée** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M3, côté boutique).
 *
 * Le brouillon part de la commande telle qu'elle est ; chaque changement
 * redemande le **devis de révision**, qui dit le nouveau total et l'écart —
 * ou le refus du serveur (heure limite, carte, journée arrêtée…), dit par sa
 * phrase. La validation renvoie la révision du dernier devis : modifiée
 * ailleurs entre-temps, le serveur refuse et l'écran propose de recharger.
 *
 * Le choix du retrait ou de la livraison passe par les MÊMES dialogues que la
 * boutique (`OrderDoors.ask*`), qui rendent un choix sans écrire celui du
 * panier : modifier une commande ne touche pas à la commande suivante.
 *
 * **L'heure limite passée** (M4), la page devient une DEMANDE : même
 * composition, un devis INDICATIF (`changeQuote`, §14 — décision de Hugo du
 * 2026-10-23), et « Demander cette modification » à la place de « Valider »
 * (`ChangeRequestCard`). C'est le serveur qui le dit, par `revisability`.
 */
@Component({
  selector: 'app-order-revision-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChangeRequestCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    RevisionQuote,
    RouterLink,
  ],
  templateUrl: './order-revision-page.html',
  styleUrl: './order-revision-page.scss',
})
export class OrderRevisionPage {
  private readonly gateway = inject(OrderRevisionGateway);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly doors = inject(OrderDoors);
  private readonly points = inject(ServicePoints);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);
  private readonly t = inject(ClientCopyService).t;

  protected readonly c = computed(() => this.t().orders.revision);

  protected readonly orderId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly state = signal<PageState>({ kind: 'loading' });
  protected readonly draft = signal<RevisionDraft>({ lines: [], service: null });
  protected readonly quote = signal<QuoteState>({ kind: 'idle' });
  protected readonly submitting = signal(false);
  protected readonly submitRefusal = signal<SubmitRefusal | null>(null);

  /** L'heure limite est passée, la commande pas au plan : on demande au lieu de modifier (M4). */
  protected readonly requesting = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready') {
      return false;
    }
    const { revisability } = state.order;
    return !revisability.revisable && revisability.code === 'too_late';
  });

  /** La commande telle qu'elle était au chargement, pour savoir s'il y a quelque chose à demander. */
  private readonly initial = signal<string | null>(null);
  protected readonly changed = computed(() => {
    const content = this.content();
    return content !== null && JSON.stringify(content) !== this.initial();
  });
  protected readonly revision = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.order.revision : 0;
  });

  protected readonly bannerTitle = computed(() =>
    this.requesting() ? this.c().request.requestTitle : this.c().reviseTitle,
  );
  protected readonly bannerLead = computed(() =>
    this.requesting() ? this.c().request.requestLead : this.c().reviseLead,
  );

  protected readonly kicker = computed(() => {
    const state = this.state();
    return state.kind === 'ready'
      ? fill(this.c().reviseKicker, { reference: state.order.orderNumber })
      : '';
  });

  /** Ce que le devis et la révision recevront ; `null` tant qu'il manque quelque chose. */
  protected readonly content = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? contentOf(this.draft(), state.order) : null;
  });

  /** Les articles de la boutique, à ajouter. */
  protected readonly addable = computed<readonly FoldSelectOption<{ sku: string; name: string }>[]>(
    () =>
      this.catalogue.items().map((item) => ({
        value: { sku: item.sku, name: item.name },
        label: item.name,
      })),
  );

  /** Le devis rendu, par SKU : le prix et le total de chaque ligne. */
  private readonly quotedLines = computed(() => {
    const quote = this.quote();
    return new Map(quote.kind === 'ready' ? quote.quote.lines.map((l) => [l.sku, l]) : []);
  });

  protected readonly lines = computed(() =>
    this.draft().lines.map((line) => {
      const quoted = this.quotedLines().get(line.sku);
      return {
        ...line,
        total: quoted === undefined ? '—' : formatCents(quoted.lineTotalCents),
        price:
          quoted === undefined ? '' : quoted.priceFrozen ? this.c().priceKept : this.c().priceToday,
        removeAria: fill(this.c().removeAria, { name: line.name }),
      };
    }),
  );

  /** Le retrait ou la livraison retenus, dits ; `null` sans choix reconstitué. */
  protected readonly service = computed(() => {
    const service = this.draft().service;
    if (service === null) {
      return null;
    }
    const c = this.c();
    const cart = this.t().cart;
    const day =
      service.date === ''
        ? ''
        : serviceDayLabel(service.date, instantToLocal(new Date()).day, this.locale.current(), {
            today: cart.dayToday,
            tomorrow: cart.dayTomorrow,
          });
    return {
      what:
        service.mode === 'pickup'
          ? fill(c.servicePickup, { place: service.place })
          : fill(c.serviceDelivery, { address: service.address }),
      when: service.slot === '' ? day : fill(c.serviceWhen, { day, slot: service.slot }),
      pickupMissing: service.mode === 'pickup' && service.pickupAddressId === null,
      timeChangeable: service.mode === 'pickup' && service.pickupAddressId !== null,
    };
  });

  /** Valider : un devis rendu, qui change quelque chose, et rien en vol. */
  protected readonly canSubmit = computed(() => {
    const quote = this.quote();
    return (
      quote.kind === 'ready' &&
      quote.quote.changes.length > 0 &&
      !this.submitting() &&
      this.content() !== null
    );
  });

  protected readonly unchanged = computed(() => {
    const quote = this.quote();
    return quote.kind === 'ready' && quote.quote.changes.length === 0;
  });

  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.points.hydrate();
    void this.catalogue.hydrate();
    effect(() => {
      const id = this.orderId();
      if (id !== '') {
        untracked(() => {
          void this.load();
        });
      }
    });
    effect(() => {
      const content = this.content();
      // Le mode compte aussi : une demande a son propre devis, indicatif.
      this.requesting();
      untracked(() => {
        this.scheduleQuote(content === null);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    this.submitRefusal.set(null);
    const order = await this.gateway.order(this.orderId());
    if (order === null) {
      this.state.set({ kind: 'failed' });
      return;
    }
    const draft = draftOf(order, this.points.pickups());
    this.draft.set(draft);
    this.initial.set(JSON.stringify(contentOf(draft, order)));
    this.state.set({ kind: 'ready', order });
  }

  protected setQuantity(sku: string, quantity: number | null): void {
    if (quantity !== null) {
      this.draft.update((draft) => ({ ...draft, lines: withQuantity(draft.lines, sku, quantity) }));
    }
  }

  protected drop(sku: string): void {
    this.draft.update((draft) => ({ ...draft, lines: withoutLine(draft.lines, sku) }));
  }

  protected add(item: { readonly sku: string; readonly name: string }): void {
    this.draft.update((draft) => ({ ...draft, lines: withAdded(draft.lines, item) }));
  }

  protected async changeService(): Promise<void> {
    const choice = await this.doors.askChoice();
    if (choice !== null) {
      this.draft.update((draft) => ({ ...draft, service: choice }));
    }
  }

  protected async changeTime(): Promise<void> {
    const service = this.draft().service;
    if (service?.mode !== 'pickup') {
      return;
    }
    const choice = await this.doors.askTime(service);
    if (choice !== null) {
      this.draft.update((draft) => ({ ...draft, service: choice }));
    }
  }

  protected async submit(): Promise<void> {
    const quote = this.quote();
    const content = this.content();
    if (!this.canSubmit() || quote.kind !== 'ready' || content === null) {
      return;
    }
    this.submitting.set(true);
    this.submitRefusal.set(null);
    const outcome = await this.gateway.revise(this.orderId(), {
      ...content,
      expectedRevision: quote.quote.revision,
    });
    this.submitting.set(false);
    if (outcome.kind === 'ok') {
      this.notify.success(this.c().revisedToast);
      // Le tiroir de la commande relit l'historique : la nouvelle composition s'y lit.
      void this.router.navigate(['/mes-commandes', this.orderId()]);
      return;
    }
    this.submitRefusal.set(
      outcome.kind === 'refused'
        ? {
            message: outcome.refusal.message || this.c().revisionRefused,
            stale: outcome.refusal.code === STALE_REVISION,
          }
        : { message: this.c().revisionRefused, stale: false },
    );
  }

  /** Le devis se redemande après un temps de calme ; une réponse dépassée est jetée. */
  private scheduleQuote(incomplete: boolean): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    const sequence = ++this.sequence;
    if (incomplete) {
      this.quote.set({ kind: 'idle' });
      return;
    }
    this.quote.set({ kind: 'loading' });
    this.timer = setTimeout(() => {
      void this.requestQuote(sequence);
    }, QUOTE_DELAY_MS);
  }

  private async requestQuote(sequence: number): Promise<void> {
    const content = this.content();
    if (content === null) {
      return;
    }
    const outcome = this.requesting()
      ? await this.gateway.changeQuote(this.orderId(), content)
      : await this.gateway.quote(this.orderId(), content);
    if (sequence !== this.sequence) {
      return;
    }
    if (outcome.kind === 'ok') {
      this.quote.set({ kind: 'ready', quote: outcome.value });
    } else if (outcome.kind === 'refused') {
      this.quote.set({
        kind: 'refused',
        message: outcome.refusal.message || this.c().revisionRefused,
      });
    } else {
      this.quote.set({ kind: 'failed' });
    }
  }

  protected retryQuote(): void {
    this.scheduleQuote(this.content() === null);
  }
}
