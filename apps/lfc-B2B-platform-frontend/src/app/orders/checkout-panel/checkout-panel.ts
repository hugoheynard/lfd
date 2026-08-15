import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import type { OrderPaymentIntent, PlaceOrderPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { StripePayment } from '../stripe-payment/stripe-payment';
import { formatEurValue } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FulfillmentService } from '../fulfillment.service';
import { OrdersService } from '../orders.service';

/**
 * Panneau **Passer commande** — étape finale **zéro friction** : l'acheminement
 * (coursier + zone + adresse, ou retrait) a déjà été choisi **en haut du panier**
 * ({@link FulfillmentService}). Ici on ne fait que confirmer (date + note), placer
 * la commande **sans entreprise** (elle appartient au client connecté), et — quand
 * une carte est requise — encaisser via le Payment Element (Stripe).
 *
 * On n'envoie que `sku` + quantité + acheminement : le serveur ré-résout tous les
 * prix (autorité).
 */
@Component({
  selector: 'app-checkout-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldCalloutComponent, StripePayment],
  templateUrl: './checkout-panel.html',
  styleUrl: './checkout-panel.scss',
})
export class CheckoutPanel {
  static readonly foldPanel: FoldPanelDefaults = { modal: false, surface: 'solid', side: 'auto' };

  private readonly ref = inject(FoldPanelRef);
  private readonly orders = inject(OrdersService);
  protected readonly cart = inject(CartService);
  protected readonly fulfillment = inject(FulfillmentService);

  /**
   * Jour de retrait/livraison — **obligatoire**. Proposé à J+1 plutôt que vide :
   * c'est le cas courant (on commande la veille pour le lendemain), et un champ
   * vide obligatoire n'est qu'une façon polie de bloquer le bouton.
   */
  protected readonly requestedDate = signal(tomorrowIso());
  protected readonly note = signal('');

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly placedNumber = signal<string | null>(null);

  /**
   * Paiement en attente : présent une fois la commande créée serveur quand une
   * carte est requise (pas d'entreprise, ou entreprise non active / per_order).
   * Bascule le panneau sur l'étape carte (Payment Element).
   */
  protected readonly pendingPayment = signal<OrderPaymentIntent | null>(null);
  private readonly pendingOrderNumber = signal('');

  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      !this.cart.isEmpty() &&
      this.fulfillment.ready() &&
      // Sans jour de service, la commande n'entre dans aucune journée de
      // production : le serveur la refuserait, autant le dire avant.
      this.requestedDate() !== '' &&
      this.placedNumber() === null,
  );

  protected fmt(value: number): string {
    return formatEurValue(value);
  }

  /** Formate un montant en **centimes** (les ajustements raisonnent en centimes). */
  protected fmtCents(cents: number): string {
    return formatEurValue(cents / 100);
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  protected placeOrder(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const payload: PlaceOrderPayload = {
      companyId: null,
      fulfillmentMethod: this.fulfillment.method(),
      // Aucune zone n'est envoyée : le serveur la déduit du code postal livré.
      deliveryAddress: this.fulfillment.deliveryAddressPayload(),
      pickupAddressId: this.fulfillment.pickupAddressId(),
      requestedDeliveryDate: this.requestedDate(),
      note: this.note().trim(),
      lines: this.cart.lines().map((line) => ({ sku: line.product.id, quantity: line.qty })),
    };
    this.orders.place(payload).subscribe({
      next: (placed) => {
        // La commande est créée serveur (le panier reflète l'état : on le vide).
        this.cart.clear();
        this.submitting.set(false);
        if (placed.payment !== undefined) {
          // Carte requise : on passe à l'étape Payment Element, commande en attente.
          this.pendingOrderNumber.set(placed.orderNumber);
          this.pendingPayment.set(placed.payment);
          return;
        }
        // Terme différé (entreprise active) : rien à encaisser, commande enregistrée.
        this.placedNumber.set(placed.orderNumber);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(readError(error));
      },
    });
  }

  /** Le Payment Element a confirmé le règlement : on affiche la confirmation. */
  protected onPaid(): void {
    this.placedNumber.set(this.pendingOrderNumber());
    this.pendingPayment.set(null);
  }

  /**
   * L'utilisateur revient de l'étape carte sans payer. La commande **existe déjà**
   * (créée serveur, `pending`) : on ferme, le règlement pourra se faire plus tard.
   */
  protected onPaymentCancelled(): void {
    this.ref.close(true);
  }

  protected done(): void {
    this.ref.close(true);
  }

  protected close(): void {
    this.ref.close();
  }
}

/** Message backend s'il est lisible (erreur métier rédigée), sinon générique. */
function readError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = (error as { error: unknown }).error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message !== '') {
        return message;
      }
    }
  }
  return 'La commande a échoué. Réessayez.';
}

/** Demain, en `AAAA-MM-JJ` local : le jour de service proposé par défaut. */
function tomorrowIso(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${`${day.getDate()}`.padStart(2, '0')}`;
}
