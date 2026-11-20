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
import { orderTotalRows } from '@lfd/b2b-ui/order';
import { CartRow } from '@lfd/b2b-ui/cart';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import type { CartStore } from '../../commandes/nouvelle-commande/cart.store';
import { MontantsPanier } from '../../commandes/nouvelle-commande/montants-panier/montants-panier';
import {
  estimatedLines,
  estimateSummary,
  estimateTotalsSource,
} from '../../commandes/nouvelle-commande/order-estimate';
import { fulfillmentWindowLabel } from '../../shared/window-label';
import { particularBlockersOf, particularSlotsOf } from '../particular-order-draft';

/** La mention fixe : rien ne se règle chez nous (§ 1). */
export const SHOP_TILL_MENTION = 'À régler à la caisse de la boutique, au retrait.';

/**
 * **Le panier d'une commande particulier** — le point, le jour, le créneau, la
 * note, les lignes et le devis (`plan-commande-particulier-reglee-en-boutique.md`, § 5).
 *
 * Retrait seulement, aucun champ de règlement : la mention le dit une fois.
 * Les montants sont ceux du devis, rendus par la règle de toute commande
 * (`orderTotalRows`) avec le régime `shop_till` — TVA et TTC, jamais recalculés.
 * Les briques sont celles de la saisie pro : la rangée du panier, le détail
 * des montants, le prix des lignes posé par le devis.
 */
@Component({
  selector: 'app-particular-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartRow,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldTextareaComponent,
    MontantsPanier,
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

  readonly place = output<void>();

  protected readonly mention = SHOP_TILL_MENTION;
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
  /** Le détail du devis, au régime `shop_till` : TVA et TTC. */
  protected readonly totalRows = computed(() => {
    const amounts = this.amounts();
    return amounts === null
      ? null
      : orderTotalRows({
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

  protected readonly blockers = computed(() =>
    particularBlockersOf({
      empty: this.cart().isEmpty(),
      pickupAddressId: this.pickupId(),
      hasSlots: this.slots().length > 0,
      window: this.window(),
      requestedDate: this.requestedDate(),
      refusal: this.estimate()?.refusal ?? null,
    }),
  );
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

  protected submit(): void {
    if (this.canPlace()) {
      this.place.emit();
    }
  }
}
