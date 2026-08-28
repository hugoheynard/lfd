import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

import { formatEurValue } from '../../data/catalogue-seed';

/**
 * Étape **paiement carte** du checkout (sociétés `per_order`).
 *
 * Monte le **Payment Element** de Stripe avec le `clientSecret` de l'intention
 * créée côté serveur, puis confirme le paiement. Tout se fait **dans le
 * navigateur** (`afterNextRender` ne s'exécute jamais côté SSR) : Stripe.js n'est
 * chargé que là, et la clé utilisée est **publique** (`pk_…`). La confirmation
 * réelle du règlement reste le **webhook serveur** — cet écran émet `paid` sur un
 * `succeeded` client, mais c'est le backend qui fait autorité sur l'état payé.
 */
@Component({
  selector: 'app-stripe-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './stripe-payment.html',
  styleUrl: './stripe-payment.scss',
})
export class StripePayment {
  /** Client secret de la PaymentIntent (créé serveur). */
  readonly clientSecret = input.required<string>();
  /** Clé publique Stripe (`pk_…`), renvoyée par le serveur au checkout. */
  readonly publishableKey = input.required<string>();
  /** Montant à régler, en centimes (pour l'affichage). */
  readonly amountCents = input.required<number>();

  /** Émis quand Stripe confirme le paiement (`succeeded`). */
  readonly paid = output<void>();
  /** Émis quand l'utilisateur revient en arrière (la commande reste en attente). */
  readonly cancelled = output<void>();

  private readonly mountRef = viewChild.required<ElementRef<HTMLDivElement>>('mount');

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // Navigateur uniquement : `afterNextRender` ne tourne pas en SSR, et le nœud
    // de montage du Payment Element existe alors dans le DOM.
    afterNextRender(() => {
      void this.mount();
    });
  }

  private async mount(): Promise<void> {
    try {
      const stripe = await loadStripe(this.publishableKey());
      if (stripe === null) {
        this.fail('Le module de paiement est indisponible.');
        return;
      }
      this.stripe = stripe;
      this.elements = stripe.elements({ clientSecret: this.clientSecret() });
      const paymentElement = this.elements.create('payment');
      paymentElement.mount(this.mountRef().nativeElement);
      this.loading.set(false);
    } catch {
      this.fail('Impossible de charger le paiement. Réessayez.');
    }
  }

  protected async pay(): Promise<void> {
    if (this.stripe === null || this.elements === null || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    // `redirect: 'if_required'` : on reste dans l'app pour une carte simple ; seuls
    // les moyens de paiement qui l'exigent (3-D Secure) provoquent une redirection.
    const result = await this.stripe.confirmPayment({
      elements: this.elements,
      redirect: 'if_required',
    });
    if (result.error !== undefined) {
      this.error.set(result.error.message ?? 'Le paiement a été refusé.');
      this.submitting.set(false);
      return;
    }
    if (result.paymentIntent?.status === 'succeeded') {
      this.paid.emit();
      return;
    }
    this.error.set('Le paiement n’a pas pu être finalisé.');
    this.submitting.set(false);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected fmtCents(cents: number): string {
    return formatEurValue(cents / 100);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
