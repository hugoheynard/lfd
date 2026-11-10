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
import type { CardComplementPaymentView, CustomerOrderDetailView } from '@lfd/contracts';
import { instantToLocal } from '@lfd/contracts';
// Par le sous-chemin sans zod, comme la passation (`ClientOrders`).
import { ORDER_TOTAL_CHANGED } from '@lfd/contracts/shop-values';
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
import {
  CARD_INCREASE_JUST_PAID,
  CARD_INCREASE_PENDING,
  CARD_INCREASE_PROVIDER_UNAVAILABLE,
  STALE_REVISION,
  OrderRevisionGateway,
  type RevisionRefusal,
} from '../order-revision.gateway';
import { CardComplementPayment } from '../card-complement-payment/card-complement-payment';
import {
  type AddedArticle,
  contentOf,
  draftOf,
  type RevisionDraft,
  withAdded,
  withoutLine,
  withQuantity,
} from '../revision-draft';
import { addedArticleOf, weightFieldOf } from '../revision-sale-terms';
import { ChangeRequestCard } from '../change-request-card/change-request-card';
import { hasRefusal, refusalsBySku } from '../revision-refusals';
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
    CardComplementPayment,
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

  /**
   * Le complément d'une hausse qui attend son paiement (plan S2, §2.5) : rendu
   * par « Valider » sur une commande payée par carte, ou repris au chargement
   * (`GET /orders/:id/complement`). Tant qu'il vit, l'écran ne montre que son
   * formulaire de carte : la commande voulue est figée dans le projet.
   */
  protected readonly complement = signal<CardComplementPaymentView | null>(null);

  /**
   * Comment le devis se réglera, dit (plan S2, R3) : « 12,00 € à payer » sur
   * une hausse carte, « pas encore possible » sur une baisse ou un total égal ;
   * `null` pour une commande qui se règle comme elle a été passée.
   */
  protected readonly settlementSaid = computed(() => {
    const quote = this.quote();
    if (quote.kind !== 'ready' || quote.quote.changes.length === 0) {
      return null;
    }
    const settlement = quote.quote.settlement;
    const card = this.c().card;
    switch (settlement.kind) {
      case 'as_placed':
        return null;
      case 'card_complement':
        return {
          blocked: false,
          text: fill(card.toPay, { amount: formatCents(settlement.complementCents) }),
        };
      case 'card_not_revisable':
        return {
          blocked: true,
          text: settlement.reason === 'unsettled' ? card.unsettled : card.notYet,
        };
    }
  });

  /** Le libellé de « Valider » : il dit le montant quand valider, c'est payer. */
  protected readonly submitLabel = computed(() => {
    if (this.submitting()) {
      return this.c().submittingCta;
    }
    const quote = this.quote();
    return quote.kind === 'ready' && quote.quote.settlement.kind === 'card_complement'
      ? fill(this.c().card.submitCta, {
          amount: formatCents(quote.quote.settlement.complementCents),
        })
      : this.c().submitCta;
  });

  /**
   * Le total vu au clic, quand le serveur l'a refusé (409 `orders.total_changed`,
   * plan S2, R14 bis). Le devis se redemande ; une fois le neuf arrivé,
   * l'écran dit l'avertissement de la passation (« Le total est passé de X à
   * Y ») et le client revalide au nouveau total. Remis à `null` par un
   * brouillon qui change, un rechargement ou une nouvelle validation.
   */
  private readonly refusedTotalCents = signal<number | null>(null);

  /** L'avertissement de la passation, une fois le devis neuf rendu et différent. */
  protected readonly totalChanged = computed(() => {
    const before = this.refusedTotalCents();
    const quote = this.quote();
    if (before === null || quote.kind !== 'ready' || quote.quote.totalCents === before) {
      return null;
    }
    const c = this.t().cart;
    return fill(c.totalChanged, {
      before: formatCents(before),
      after: formatCents(quote.quote.totalCents),
      changes: c.changeOther,
    });
  });

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

  /** Les articles de la boutique, à ajouter — au poids, avec leur pas et leur minimum (P5). */
  protected readonly addable = computed<readonly FoldSelectOption<AddedArticle>[]>(() =>
    this.catalogue.items().map((item) => ({
      value: addedArticleOf(item),
      label: item.name,
    })),
  );

  /** Le catalogue par SKU : le pas et le minimum d'une ligne au poids se lisent là. */
  private readonly itemsBySku = computed(
    () => new Map(this.catalogue.items().map((item) => [item.sku, item] as const)),
  );

  /** Le devis rendu, par SKU : le prix et le total de chaque ligne. */
  private readonly quotedLines = computed(() => {
    const quote = this.quote();
    return new Map(quote.kind === 'ready' ? quote.quote.lines.map((l) => [l.sku, l]) : []);
  });

  /** Les refus du devis par SKU — prix qui changerait, article retiré, remise perdue (§ 10.4). */
  private readonly refusals = computed(() => {
    const quote = this.quote();
    return quote.kind === 'ready'
      ? refusalsBySku(quote.quote, this.c().refusals, this.locale.current())
      : new Map<string, readonly string[]>();
  });

  protected readonly lines = computed(() =>
    this.draft().lines.map((line) => {
      const quoted = this.quotedLines().get(line.sku);
      return {
        ...line,
        ...weightFieldOf(line, this.itemsBySku().get(line.sku)),
        total: quoted === undefined ? '—' : formatCents(quoted.lineTotalCents),
        price:
          quoted === undefined ? '' : quoted.priceFrozen ? this.c().priceKept : this.c().priceToday,
        removeAria: fill(this.c().removeAria, { name: line.name }),
        refusals: this.refusals().get(line.sku) ?? [],
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

  /** Valider : un devis rendu, sans refus, qui change quelque chose, et rien en vol. */
  protected readonly canSubmit = computed(() => {
    const quote = this.quote();
    return (
      quote.kind === 'ready' &&
      quote.quote.changes.length > 0 &&
      !hasRefusal(quote.quote) &&
      quote.quote.settlement.kind !== 'card_not_revisable' &&
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
        this.refusedTotalCents.set(null);
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
    this.refusedTotalCents.set(null);
    this.complement.set(null);
    const order = await this.gateway.order(this.orderId());
    if (order === null) {
      this.state.set({ kind: 'failed' });
      return;
    }
    // Un complément vivant se reprend : le rechargement ne perd pas le paiement.
    if (order.revisability.revisable && order.revisability.cardIncreaseOnly === true) {
      this.complement.set(await this.gateway.complement(this.orderId()));
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

  protected add(item: AddedArticle): void {
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
    this.refusedTotalCents.set(null);
    // Le total envoyé est celui du devis À L'ÉCRAN : tout changement du
    // brouillon repasse le devis en `loading`, et `canSubmit` exige `ready`.
    const payload = {
      ...content,
      expectedRevision: quote.quote.revision,
      expectedTotalCents: quote.quote.totalCents,
    };
    if (quote.quote.settlement.kind === 'card_complement') {
      await this.proposeCardIncrease(payload, quote.quote.totalCents);
      return;
    }
    const outcome = await this.gateway.revise(this.orderId(), payload);
    this.submitting.set(false);
    if (outcome.kind === 'refused' && outcome.refusal.code === ORDER_TOTAL_CHANGED) {
      this.refusedTotalCents.set(quote.quote.totalCents);
      this.scheduleQuote(this.content() === null);
      return;
    }
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

  /**
   * « Valider » sur une hausse carte (plan S2, §2.4) : le complément se
   * prépare, et son formulaire se monte sur cet écran. La commande ne change
   * qu'une fois le complément payé.
   */
  private async proposeCardIncrease(
    payload: Parameters<OrderRevisionGateway['proposeCardIncrease']>[1],
    shownTotalCents: number,
  ): Promise<void> {
    const outcome = await this.gateway.proposeCardIncrease(this.orderId(), payload);
    this.submitting.set(false);
    if (outcome.kind === 'ok') {
      this.complement.set(outcome.value);
      return;
    }
    if (outcome.kind === 'refused' && outcome.refusal.code === ORDER_TOTAL_CHANGED) {
      this.refusedTotalCents.set(shownTotalCents);
      this.scheduleQuote(this.content() === null);
      return;
    }
    this.submitRefusal.set(
      outcome.kind === 'refused'
        ? this.cardRefusalOf(outcome.refusal)
        : { message: this.c().revisionRefused, stale: false },
    );
  }

  /** Les refus nommés de la hausse, dans la langue du client ; les autres, par la phrase du serveur. */
  private cardRefusalOf(refusal: RevisionRefusal): SubmitRefusal {
    const card = this.c().card;
    switch (refusal.code) {
      case CARD_INCREASE_PENDING:
        return { message: card.pending, stale: true };
      case CARD_INCREASE_JUST_PAID:
        return { message: card.justPaid, stale: true };
      case CARD_INCREASE_PROVIDER_UNAVAILABLE:
        return { message: card.providerUnavailable, stale: false };
      default:
        return {
          message: refusal.message || this.c().revisionRefused,
          stale: refusal.code === STALE_REVISION,
        };
    }
  }

  /** Le complément est payé et la modification appliquée : l'annoncer, rouvrir la commande. */
  protected onApplied(): void {
    this.notify.success(this.c().revisedToast);
    void this.router.navigate(['/mes-commandes', this.orderId()]);
  }

  /** Le complément est abandonné : la commande n'a pas changé, on la relit. */
  protected onAbandoned(): void {
    this.notify.info(this.c().card.abandonedToast);
    void this.load();
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
