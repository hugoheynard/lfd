import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderEstimateView, FulfillmentWindow, PickupAddressView } from '@lfd/contracts';
import type { TotalRow } from '@lfd/b2b-ui/order';
import { orderTotalRows } from '@lfd/b2b-ui/order';
import { CartRow } from '@lfd/b2b-ui/cart';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { CartStore } from '../../commandes/nouvelle-commande/cart.store';
import { MontantsPanier } from '../../commandes/nouvelle-commande/montants-panier/montants-panier';
import { OfferReasonFields } from '../../commandes/nouvelle-commande/offer-reason-fields/offer-reason-fields';
import {
  estimatedLines,
  estimateRowsOf,
  estimateSummary,
  estimateTotalsSource,
} from '../../commandes/nouvelle-commande/order-estimate';
import { fulfillmentWindowLabel } from '../../shared/window-label';
import { ParticularDeliveryFields } from '../particular-delivery-fields/particular-delivery-fields';
import {
  offerChoiceOf,
  offeredParticularBlockersOf,
  type ParticularOfferDraft,
} from '../particular-offer-draft';
import { particularBlockersOf, particularSlotsOf } from '../particular-order-draft';

/** La mention fixe : rien ne se règle chez nous (§ 1). */
export const SHOP_TILL_MENTION = 'À régler à la caisse de la boutique, au retrait.';

/** La mention d'une commande offerte : rien à régler, nulle part. */
export const OFFERED_MENTION = 'Offerte : ni facturée, ni prélevée, ni réglée en boutique.';

/**
 * **Le panier d'une commande particulier** — le point, le jour, le créneau, la
 * note, les lignes et le devis (`commande-particulier-reglee-en-boutique.md`, § 5).
 *
 * Retrait seulement, aucun champ de règlement : la mention le dit une fois.
 * Les montants sont ceux du devis, rendus par la règle de toute commande
 * (`orderTotalRows`) avec le régime `shop_till` — TVA et TTC, jamais recalculés.
 * Les briques sont celles de la saisie pro : la rangée du panier, le détail
 * des montants, le prix des lignes posé par le devis.
 *
 * Avec le droit d'offrir, « Offrir cette commande » ouvre le motif et le mode
 * d'acheminement — une offerte peut être livrée à une adresse dictée — et
 * montre la valeur offerte que le devis rend (`plan-commande-offerte.md`,
 * O7c). La page envoie alors la commande par la route offerte.
 */
@Component({
  selector: 'app-particular-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartRow,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
    MontantsPanier,
    OfferReasonFields,
    ParticularDeliveryFields,
  ],
  templateUrl: './particular-cart.html',
  styleUrl: './particular-cart.scss',
})
export class ParticularCart {
  readonly cart = input.required<CartStore>();
  /** Les points ouverts aux particuliers. */
  readonly pickups = input.required<readonly PickupAddressView[]>();
  readonly pickupId = model<string | null>(null);
  readonly requestedDate = model('');
  readonly window = model<FulfillmentWindow | null>(null);
  readonly note = model('');
  readonly estimate = input<AdminOrderEstimateView | null>(null);
  /** Le devis courant répond à la saisie à l'écran. */
  readonly estimateReady = input(false);
  readonly submitting = input(false);
  /** L'offre en cours de saisie ; `null` sans le droit d'offrir. */
  readonly offer = input<ParticularOfferDraft | null>(null);

  readonly place = output<void>();

  /** « Offrir cette commande » est coché. */
  protected readonly offering = computed(() => this.offer()?.offering() ?? false);
  /** Livrée : seulement une offerte, à une adresse dictée. */
  protected readonly delivered = computed(
    () => this.offering() && this.offer()?.method() === 'delivery',
  );
  protected readonly mention = computed(() =>
    this.offering() ? OFFERED_MENTION : SHOP_TILL_MENTION,
  );
  protected readonly methods: readonly FoldViewToggleOption[] = [
    { value: 'pickup', icon: 'store', label: 'Retrait boutique' },
    { value: 'delivery', icon: 'truck', label: 'Livraison' },
  ];
  protected readonly confirming = signal(false);

  protected readonly pickup = computed(
    () => this.pickups().find((point) => point.id === this.pickupId()) ?? null,
  );
  protected readonly pickupOptions = computed(() =>
    this.pickups().map((point) => ({ value: point.id, label: point.label || point.ville })),
  );
  private readonly slots = computed(() => particularSlotsOf(this.pickup()));
  protected readonly slotOptions = computed(() =>
    this.slots().map((slot) => ({ value: slot.id, label: fulfillmentWindowLabel(slot) })),
  );
  /** Le créneau retenu, `null` tant qu'aucun ne l'est. */
  protected readonly slotId = computed(() => {
    const chosen = this.window();
    return (
      this.slots().find((slot) => slot.start === chosen?.start && slot.end === chosen.end)?.id ??
      null
    );
  });

  private readonly amounts = computed(() => this.estimate()?.amounts ?? null);
  protected readonly shownLines = computed(() =>
    estimatedLines(this.cart().pricedLines(), this.amounts()),
  );
  /**
   * Le détail du devis : au régime `shop_till` (TVA et TTC), ou offert — total
   * nul et valeur offerte, telle que le serveur la rend.
   */
  protected readonly totalRows = computed<readonly TotalRow[] | null>(() => {
    const amounts = this.amounts();
    if (amounts === null) {
      return null;
    }
    if (this.offering()) {
      return estimateRowsOf(amounts, {
        settlement: 'offered',
        method: this.delivered() ? 'delivery' : 'pickup',
        pickupAddressId: this.pickupId(),
        pickups: this.pickups(),
      });
    }
    return orderTotalRows({
      ...estimateTotalsSource(amounts, 'link', 'pickup', this.pickup()),
      settlement: 'shop_till',
    });
  });
  protected readonly summary = computed(() =>
    estimateSummary(this.cart().itemCount(), this.totalRows()),
  );
  protected readonly warnings = computed(
    () => this.estimate()?.warnings.map((notice) => notice.message) ?? [],
  );

  protected readonly blockers = computed(() => {
    const facts = {
      empty: this.cart().isEmpty(),
      pickupAddressId: this.pickupId(),
      hasSlots: this.slots().length > 0,
      window: this.window(),
      requestedDate: this.requestedDate(),
      refusal: this.estimate()?.refusal ?? null,
    };
    const offer = this.offer();
    return offer !== null && offer.offering()
      ? offeredParticularBlockersOf({ ...facts, offer: offerChoiceOf(offer) })
      : particularBlockersOf(facts);
  });
  protected readonly canPlace = computed(
    () => this.blockers().length === 0 && this.estimateReady() && !this.submitting(),
  );

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

  protected onOffering(checked: boolean): void {
    this.offer()?.offering.set(checked);
    // Offrir ou non change ce qu'on confirme : la confirmation se rouvre.
    this.confirming.set(false);
  }

  protected onMethod(value: string): void {
    this.offer()?.method.set(value === 'delivery' ? 'delivery' : 'pickup');
    this.confirming.set(false);
  }

  protected submit(): void {
    if (this.canPlace()) {
      this.place.emit();
    }
  }
}
