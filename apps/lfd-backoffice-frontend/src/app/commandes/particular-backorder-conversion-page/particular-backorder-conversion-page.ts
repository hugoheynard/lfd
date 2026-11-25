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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import type {
  AdminBackorderParticularQuotePayload,
  AdminBackorderView,
  AdminOrderEstimateView,
  BackorderParticularVenue,
  FulfillmentWindow,
  OrderOfferNature,
  PickupAddressView,
} from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { particularPickupsOf, particularSlotsOf } from '../../comptoir/particular-order-draft';
import { NotifyService } from '../../notify.service';
import { serverMessageOf } from '../../production/server-message';
import { GestureIntents } from '../../shared/gesture-intents';
import { fulfillmentWindowLabel } from '../../shared/window-label';
import { BackorderLines } from '../backorder-lines/backorder-lines';
import { AdminBackordersService } from '../backorders.service';
import { tomorrowIso } from '../nouvelle-commande/draft.store';
import { MontantsPanier } from '../nouvelle-commande/montants-panier/montants-panier';
import { OfferReasonFields } from '../nouvelle-commande/offer-reason-fields/offer-reason-fields';
import {
  estimatesOf,
  failedEstimateOf,
  type EstimateRequest,
} from '../nouvelle-commande/order-estimate';
import { isTotalChangedRefusal } from '../nouvelle-commande/total-changed-refusal';
import { AdminOrdersService } from '../orders.service';
import {
  BACKORDER_VENUE_WORDS,
  particularBackorderBlockersOf,
  particularBackorderLoadRefusalOf,
  particularBackorderPayloadOf,
  particularBackorderTotalRowsOf,
} from '../particular-backorder-payload';

type LoadState = 'loading' | 'error' | 'ready';

/** Le sujet de l'intention de transformer : un reliquat ne se transforme qu'une fois. */
const convertSubject = (backorderId: string): string => `backorder-convert:${backorderId}`;

/**
 * **Transformer le reliquat d'un particulier** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 bis,
 * décision 13) : en commande réglée à la caisse de la boutique, ou offerte
 * (`?venue=offered`, sous le droit d'offrir). Les lignes sont en lecture — le
 * serveur les reprend au prix de la commande d'origine ; l'équipe choisit le
 * point de retrait, le jour (aujourd'hui compris) et le créneau. Retrait
 * seulement.
 *
 * Elle réutilise les briques de la saisie du particulier (points et créneaux
 * publics, flux du devis, montants, motif de l'offre) mais appelle les routes
 * du reliquat — `/quote` puis `/convert`, avec la clé d'une `GestureIntents`.
 */
@Component({
  selector: 'app-particular-backorder-conversion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackorderLines,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTextareaComponent,
    MontantsPanier,
    OfferReasonFields,
  ],
  templateUrl: './particular-backorder-conversion-page.html',
  styleUrl: './particular-backorder-conversion-page.scss',
})
export class ParticularBackorderConversionPage {
  /** La commande d'origine : le reliquat se lit sur sa fiche. */
  readonly orderId = input.required<string>();
  /** `?venue=` : `offered` pour l'offerte, la caisse de la boutique sinon. */
  readonly venue = input<string>();

  private readonly orders = inject(AdminOrdersService);
  private readonly backorders = inject(AdminBackordersService);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly intents = new GestureIntents();

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly backorder = signal<AdminBackorderView | null>(null);
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly pickupId = signal<string | null>(null);
  protected readonly requestedDate = signal(tomorrowIso());
  protected readonly window = signal<FulfillmentWindow | null>(null);
  protected readonly note = signal('');
  protected readonly offerNature = signal<OrderOfferNature | null>(null);
  protected readonly offerNote = signal('');
  protected readonly offerNotifiesCustomer = signal(false);
  protected readonly submitting = signal(false);
  protected readonly confirming = signal(false);

  protected readonly chosenVenue = computed<BackorderParticularVenue>(() =>
    this.venue() === 'offered' ? 'offered' : 'shop_till',
  );
  protected readonly words = computed(() => BACKORDER_VENUE_WORDS[this.chosenVenue()]);
  protected readonly back = computed(() => ['/commandes', this.orderId()]);
  protected readonly title = computed(() => {
    const backorder = this.backorder();
    const kind = this.words().title;
    return backorder === null
      ? `Transformer le reliquat en commande ${kind}`
      : `Reliquat de ${backorder.origin.orderNumber} : commande ${kind}`;
  });

  private readonly pickup = computed(
    () => this.pickups().find((point) => point.id === this.pickupId()) ?? null,
  );
  protected readonly pickupOptions = computed(() =>
    this.pickups().map((point) => ({ value: point.id, label: point.label || point.ville })),
  );
  private readonly slots = computed(() => particularSlotsOf(this.pickup()));
  protected readonly slotOptions = computed(() =>
    this.slots().map((slot) => ({ value: slot.id, label: fulfillmentWindowLabel(slot) })),
  );
  protected readonly slotId = computed(() => {
    const chosen = this.window();
    return (
      this.slots().find((slot) => slot.start === chosen?.start && slot.end === chosen.end)?.id ??
      null
    );
  });

  private readonly choice = computed(() => ({
    venue: this.chosenVenue(),
    pickupAddressId: this.pickupId(),
    requestedDate: this.requestedDate(),
    window: this.window(),
    note: this.note(),
    offerNature: this.offerNature(),
    offerNote: this.offerNote(),
    offerNotifiesCustomer: this.offerNotifiesCustomer(),
  }));
  private readonly request = computed<EstimateRequest<AdminBackorderParticularQuotePayload> | null>(
    () => {
      const payload =
        this.backorder() === null ? null : particularBackorderPayloadOf(this.choice());
      return payload === null ? null : { key: JSON.stringify(payload), payload };
    },
  );

  protected readonly estimate = signal<AdminOrderEstimateView | null>(null);
  private readonly estimatedKey = signal<string | null>(null);
  protected readonly estimateReady = computed(() => {
    const request = this.request();
    return request !== null && this.estimate() !== null && this.estimatedKey() === request.key;
  });

  /** Le détail du devis : au régime `shop_till` (TVA et TTC), ou offert. */
  protected readonly totalRows = computed(() =>
    particularBackorderTotalRowsOf(
      this.estimate()?.amounts ?? null,
      this.chosenVenue(),
      this.pickup(),
      this.pickups(),
    ),
  );

  protected readonly blockers = computed(() =>
    particularBackorderBlockersOf({
      choice: this.choice(),
      hasSlots: this.slots().length > 0,
      refusal: this.estimate()?.refusal ?? null,
    }),
  );
  protected readonly canConvert = computed(
    () =>
      this.blockers().length === 0 &&
      this.estimateReady() &&
      this.estimate()?.amounts != null &&
      !this.submitting(),
  );
  protected readonly convertLabel = computed(() =>
    this.request() !== null && !this.estimateReady() ? 'Calcul du montant…' : this.words().action,
  );

  constructor() {
    effect(() => {
      const orderId = this.orderId();
      untracked(() => void this.load(orderId));
    });
    estimatesOf(toObservable(this.request), (payload, key) =>
      this.quote(payload).pipe(
        catchError((error: unknown) => of(failedEstimateOf(error))),
        tap(() => this.estimatedKey.set(key)),
      ),
    )
      .pipe(takeUntilDestroyed())
      .subscribe((estimate) => this.estimate.set(estimate));
  }

  protected async load(orderId: string): Promise<void> {
    this.state.set('loading');
    this.loadError.set(null);
    try {
      const [origin, points] = await Promise.all([
        this.orders.byId(orderId),
        this.pickupsService.list(),
      ]);
      const backorder = origin.backorder ?? null;
      const refusal = particularBackorderLoadRefusalOf(
        backorder,
        this.chosenVenue() === 'offered' && !this.permissions.can('b2b_offer_order:write'),
      );
      if (refusal !== null) {
        this.loadError.set(refusal);
        this.state.set('error');
        return;
      }
      const open = particularPickupsOf(points);
      this.pickups.set(open);
      this.pickupId.set(open.length === 1 ? (open[0]?.id ?? null) : null);
      this.backorder.set(backorder);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(serverMessageOf(error));
      this.state.set('error');
    }
  }

  protected onPickup(id: string): void {
    this.pickupId.set(id);
    // Les créneaux sont ceux du point : un autre point les remet à choisir.
    this.window.set(null);
    this.confirming.set(false);
  }

  protected onSlot(id: string): void {
    const slot = this.slots().find((entry) => entry.id === id);
    this.window.set(slot === undefined ? null : { start: slot.start, end: slot.end });
    this.confirming.set(false);
  }

  /** `/convert`, avec le total que `/quote` a montré et la clé de ce geste. */
  protected async convert(): Promise<void> {
    const backorder = this.backorder();
    const request = this.request();
    const amounts = this.estimate()?.amounts ?? null;
    if (backorder === null || request === null || amounts === null || !this.canConvert()) {
      return;
    }
    const subject = convertSubject(backorder.id);
    this.submitting.set(true);
    try {
      const placed = await this.backorders.convertParticular(
        backorder.id,
        { ...request.payload, expectedTotalCents: amounts.totalCents },
        this.intents.keyFor(subject),
      );
      this.intents.done(subject);
      this.notify.success(
        `Commande ${placed.orderNumber} créée depuis le reliquat de ${backorder.origin.orderNumber}.`,
      );
      await this.router.navigate(['/commandes', placed.id]);
    } catch (error) {
      this.confirming.set(false);
      if (isTotalChangedRefusal(error)) {
        this.notify.refused(error, 'Le total a changé : vérifiez le nouveau montant.');
        this.refreshEstimate(request);
      } else {
        this.notify.error(error, "La commande n'a pas pu être créée depuis le reliquat.");
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /** Redemande l'estimation : le flux ne la redemande pas tant que la saisie ne change pas. */
  private refreshEstimate(request: EstimateRequest<AdminBackorderParticularQuotePayload>): void {
    this.estimatedKey.set(null);
    this.quote(request.payload)
      .pipe(catchError((error: unknown) => of(failedEstimateOf(error))))
      .subscribe((view) => {
        if (this.request()?.key === request.key) {
          this.estimate.set(view);
          this.estimatedKey.set(request.key);
        }
      });
  }

  private quote(payload: AdminBackorderParticularQuotePayload) {
    const backorder = this.backorder();
    return backorder === null
      ? of(failedEstimateOf(null))
      : this.backorders.quote(backorder.id, payload);
  }
}
