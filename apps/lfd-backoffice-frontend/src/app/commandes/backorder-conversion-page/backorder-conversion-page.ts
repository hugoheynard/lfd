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
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import {
  audienceOf,
  DEFAULT_DELIVERY_AVAILABILITY,
  STAFF_SETTLEMENT_LABELS,
  type AdminBackorderQuotePayload,
  type AdminBackorderView,
  type AdminOrderEstimateView,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
  type StaffSettlement,
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
  type FoldSelectItem,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { serverMessageOf } from '../../production/server-message';
import { GestureIntents } from '../../shared/gesture-intents';
import { BackorderLines } from '../backorder-lines/backorder-lines';
import { backorderPayloadOf } from '../backorder-payload';
import { withFreeDelivery } from '../backorder-words';
import { AdminBackordersService } from '../backorders.service';
import {
  AcheminementCommande,
  type FulfillmentChoice,
} from '../nouvelle-commande/acheminement-commande/acheminement-commande';
import { buyerOf, composedDraftOf } from '../nouvelle-commande/draft-payload';
import { DraftStore } from '../nouvelle-commande/draft.store';
import { MontantsPanier } from '../nouvelle-commande/montants-panier/montants-panier';
import { OfferReasonFields } from '../nouvelle-commande/offer-reason-fields/offer-reason-fields';
import type {
  OrderEntryBuyer,
  OrderEntryCustomer,
} from '../nouvelle-commande/order-entry-customer';
import {
  estimatesOf,
  estimateRowsOf,
  failedEstimateOf,
  isBlockingRefusal,
  type EstimateRequest,
} from '../nouvelle-commande/order-estimate';
import { panierBlockersOf } from '../nouvelle-commande/panier-blockers';
import { isTotalChangedRefusal } from '../nouvelle-commande/total-changed-refusal';
import { CommercialOrderEntrySource } from '../order-entry-sources';
import { AdminOrdersService } from '../orders.service';

type LoadState = 'loading' | 'error' | 'ready';

/** Le sujet de l'intention de transformer : un reliquat ne se transforme qu'une fois. */
const convertSubject = (backorderId: string): string => `backorder-convert:${backorderId}`;

/**
 * **Transformer un reliquat en commande** (`documentation/commandes/reliquat/reliquat.md`, § 6.3 et § 6.5) :
 * la saisie de l'équipe, garnie du reliquat. Les lignes sont en lecture — le
 * serveur les reprend au prix de la commande d'origine ; l'équipe choisit le
 * jour (aujourd'hui compris), le règlement, le mode et l'adresse, et
 * l'interlocuteur.
 *
 * Elle réutilise les briques de la saisie (brouillon, acheminement,
 * composition, flux d'estimation, montants) mais appelle les routes du
 * reliquat — `/quote` puis `/convert` avec la clé d'une `GestureIntents` —,
 * JAMAIS `POST /admin/orders` : une passation ordinaire ne fermerait pas le
 * reliquat et rejugerait les prix.
 */
@Component({
  selector: 'app-backorder-conversion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AcheminementCommande,
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
  templateUrl: './backorder-conversion-page.html',
  styleUrl: './backorder-conversion-page.scss',
})
export class BackorderConversionPage {
  /** La commande d'origine : le reliquat se lit sur sa fiche. */
  readonly orderId = input.required<string>();

  private readonly orders = inject(AdminOrdersService);
  private readonly backorders = inject(AdminBackordersService);
  private readonly customers = inject(CommercialOrderEntrySource);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly zonesService = inject(DeliveryZonesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly intents = new GestureIntents();

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly backorder = signal<AdminBackorderView | null>(null);
  protected readonly company = signal<OrderEntryCustomer | null>(null);
  protected readonly pickups = signal<readonly PickupAddressView[]>([]);
  protected readonly zones = signal<readonly DeliveryZoneView[]>([]);
  protected readonly deliveryAvailability = signal<DeliveryAvailabilityView>(
    DEFAULT_DELIVERY_AVAILABILITY,
  );
  protected readonly draft = new DraftStore();
  protected readonly submitting = signal(false);
  protected readonly confirming = signal(false);

  protected readonly back = computed(() => ['/commandes', this.orderId()]);
  protected readonly title = computed(() => {
    const backorder = this.backorder();
    return backorder === null
      ? 'Transformer le reliquat'
      : `Transformer le reliquat de ${backorder.origin.orderNumber}`;
  });
  protected readonly addresses = computed(() => this.company()?.addresses ?? []);
  protected readonly audience = computed(() => audienceOf(this.company()?.status ?? null));
  protected readonly buyers = computed<readonly OrderEntryBuyer[]>(
    () => this.company()?.buyers ?? [],
  );
  /** L'interlocuteur retenu : celui d'origine tant qu'il a accès, puis le défaut. */
  protected readonly buyer = computed(() => buyerOf(this.draft.buyerUserId(), this.buyers()));
  protected readonly buyerOptions = computed<FoldSelectItem<string>[]>(() =>
    this.buyers().map((member) => ({ value: member.userId, label: nameOf(member) })),
  );
  /**
   * L'acheteur d'origine n'a plus d'accès au compte : le serveur le
   * refuserait. On le dit, et l'interlocuteur proposé est un autre.
   */
  protected readonly originBuyerGone = computed(() => {
    const backorder = this.backorder();
    return (
      backorder !== null &&
      this.state() === 'ready' &&
      !this.buyers().some((member) => member.userId === backorder.buyer.userId)
    );
  });

  protected readonly canOffer = computed(() => this.permissions.can('b2b_offer_order:write'));
  protected readonly settlesOnAccount = computed(() => this.company()?.settlesOnAccount ?? false);
  protected readonly payerIsPublic = computed(() => this.company()?.payerIsPublic ?? false);
  protected readonly settlementOptions = computed<FoldSelectItem<StaffSettlement>[]>(() => {
    const modes: StaffSettlement[] = [
      ...(this.settlesOnAccount() || this.payerIsPublic() ? (['account'] as const) : []),
      ...(this.payerIsPublic() ? [] : (['link'] as const)),
      ...(this.canOffer() ? (['offered'] as const) : []),
    ];
    return modes.map((mode) => ({ value: mode, label: STAFF_SETTLEMENT_LABELS[mode] }));
  });

  protected readonly fulfillment = computed(() => this.draft.fulfillment());
  protected readonly dateLabel = computed(() =>
    this.fulfillment()?.method === 'delivery' ? 'Livraison le' : 'Retrait le',
  );

  /** La commande qu'on passerait — la même définition que la saisie. */
  private readonly composed = computed(() =>
    composedDraftOf({
      buyerUserId: this.buyer(),
      fulfillment: this.draft.fulfillment(),
      requestedDate: this.draft.requestedDate(),
      note: this.draft.note(),
      settlement: this.draft.settlement(),
      offerNature: this.draft.offerNature(),
      offerNote: this.draft.offerNote(),
      offerNotifiesCustomer: this.draft.offerNotifiesCustomer(),
      immediate: false,
      // Les lignes sont celles du reliquat : jamais vide.
      empty: false,
    }),
  );

  private readonly request = computed<EstimateRequest<AdminBackorderQuotePayload> | null>(() => {
    const draft = this.composed();
    if (draft === null || this.backorder() === null) {
      return null;
    }
    const payload = backorderPayloadOf(draft);
    return { key: JSON.stringify(payload), payload };
  });

  protected readonly estimate = signal<AdminOrderEstimateView | null>(null);
  private readonly estimatedKey = signal<string | null>(null);
  protected readonly estimateReady = computed(() => {
    const request = this.request();
    return request !== null && this.estimate() !== null && this.estimatedKey() === request.key;
  });

  /** Le détail des montants, et la livraison offerte dite — jamais « encore 0 € ». */
  protected readonly totalRows = computed(() => {
    const fulfillment = this.fulfillment();
    const rows = estimateRowsOf(this.estimate()?.amounts ?? null, {
      settlement: this.draft.settlement(),
      method: fulfillment?.method ?? 'pickup',
      pickupAddressId: fulfillment?.pickupAddressId ?? null,
      pickups: this.pickups(),
    });
    return rows === null ? null : withFreeDelivery(rows, fulfillment?.method ?? 'pickup');
  });

  protected readonly blockers = computed(() => {
    const fulfillment = this.fulfillment();
    return panierBlockersOf({
      empty: false,
      hasBuyer: this.buyer() !== null,
      requestedDate: this.draft.requestedDate(),
      // Rien d'émis encore : le temps d'un rendu.
      fulfillmentIssue: fulfillment === null ? 'Acheminement non déterminé.' : fulfillment.issue,
      shelfIssue: null,
      settlement: this.draft.settlement(),
      linkOffered: !this.payerIsPublic(),
      settlesOnAccount: this.settlesOnAccount() || this.payerIsPublic(),
      canOffer: this.canOffer(),
      offerNature: this.draft.offerNature(),
      offerNote: this.draft.offerNote(),
      payerIsPublic: this.payerIsPublic(),
      refusal: this.estimate()?.refusal ?? null,
    }).map((blocker) => blocker.text);
  });

  /** Ce que la passation jugera : dit, sans retenir. */
  protected readonly warnings = computed(() => {
    const estimate = this.estimate();
    if (estimate === null) {
      return [];
    }
    const refusal = estimate.refusal;
    const soft = refusal !== null && !isBlockingRefusal(refusal) ? [refusal] : [];
    return [...soft, ...estimate.warnings].map((notice) => notice.message);
  });

  protected readonly canConvert = computed(
    () =>
      this.blockers().length === 0 &&
      this.estimateReady() &&
      this.estimate()?.amounts != null &&
      !this.submitting(),
  );

  /** « Calcul du montant… » tant qu'une estimation de la saisie complète est attendue. */
  protected readonly convertLabel = computed(() =>
    this.request() !== null && !this.estimateReady()
      ? 'Calcul du montant…'
      : 'Transformer en commande',
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
      const origin = await this.orders.byId(orderId);
      const backorder = origin.backorder ?? null;
      const companyId = backorder?.company?.id ?? null;
      if (backorder === null || backorder.state !== 'open' || companyId === null) {
        this.loadError.set(
          backorder === null
            ? 'Cette commande n’a pas de reliquat.'
            : backorder.state !== 'open'
              ? 'Ce reliquat est déjà transformé ou abandonné.'
              : 'Le reliquat d’un particulier ne se transforme pas ici.',
        );
        this.state.set('error');
        return;
      }
      const customer = this.customers.customer(companyId);
      const [company, pickups, zones, availability] = await Promise.all([
        customer,
        this.pickupsService.listFor(companyId),
        customer.then((found) => this.zonesService.listFor(audienceOf(found?.status ?? null))),
        this.customers.deliveryAvailability().catch(() => DEFAULT_DELIVERY_AVAILABILITY),
      ]);
      if (company === undefined) {
        this.loadError.set('Le compte du reliquat n’a pas pu être lu.');
        this.state.set('error');
        return;
      }
      this.company.set(company);
      this.pickups.set(pickups);
      this.zones.set(zones);
      this.deliveryAvailability.set(availability);
      // L'acheteur d'origine est proposé ; `buyerOf` le remplace s'il est parti.
      this.draft.buyerUserId.set(backorder.buyer.userId);
      this.draft.settlement.set(
        company.settlesOnAccount || company.payerIsPublic ? 'account' : 'link',
      );
      this.backorder.set(backorder);
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(serverMessageOf(error));
      this.state.set('error');
    }
  }

  protected onFulfillment(choice: FulfillmentChoice): void {
    this.draft.fulfillment.set(choice);
    this.confirming.set(false);
  }

  protected onSettlement(value: StaffSettlement): void {
    this.draft.settlement.set(value);
    this.confirming.set(false);
  }

  protected onDate(value: string): void {
    this.draft.requestedDate.set(value);
    this.draft.dateProposed.set(false);
  }

  /** `/quote` puis `/convert`, avec le total que `/quote` a montré. */
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
      const placed = await this.backorders.convert(
        backorder.id,
        { ...request.payload, expectedTotalCents: amounts.totalCents },
        this.intents.keyFor(subject),
      );
      this.intents.done(subject);
      this.notify.success(
        `Commande ${placed.orderNumber} créée depuis le reliquat de ${backorder.origin.orderNumber}.`,
      );
      if (placed.paymentUrl !== undefined) {
        this.notify.info(`Lien de règlement à transmettre : ${placed.paymentUrl}`);
      }
      await this.router.navigate(['/commandes', placed.id]);
    } catch (error) {
      this.confirming.set(false);
      if (isTotalChangedRefusal(error)) {
        this.notify.refused(error, 'Le total a changé : vérifiez le nouveau montant.');
        await this.refreshEstimate(request);
      } else {
        this.notify.error(error, "La commande n'a pas pu être créée depuis le reliquat.");
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private quote(payload: AdminBackorderQuotePayload) {
    const backorder = this.backorder();
    return backorder === null
      ? of(failedEstimateOf(null))
      : this.backorders.quote(backorder.id, payload);
  }

  /** Redemande l'estimation : le flux ne la redemande pas tant que la saisie ne change pas. */
  private async refreshEstimate(
    request: EstimateRequest<AdminBackorderQuotePayload>,
  ): Promise<void> {
    try {
      const view = await firstValueFrom(this.quote(request.payload));
      if (this.request()?.key === request.key) {
        this.estimate.set(view);
        this.estimatedKey.set(request.key);
      }
    } catch {
      // Le refus vient d'être dit ; l'estimation affichée reste.
    }
  }
}

/** Le nom d'une personne, ou son adresse quand elle n'en a pas encore. */
function nameOf(member: OrderEntryBuyer): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name === '' ? member.email : name;
}
