import { Injectable, signal } from '@angular/core';
import type { OrderPaymentIntent } from '@lfd/contracts';

/**
 * **Le paiement d'une commande tout juste passée, gardé en mémoire** — et rien
 * d'autre, pour que la garde de la page de règlement le lise sans charger
 * `ClientOrders` dans le bundle initial (430 Ko de plus, mesuré le
 * 2026-11-22).
 *
 * Elle évite à la page de règlement un aller-retour, et surtout un second
 * appel au prestataire pour une instruction qu'on vient de recevoir. Elle
 * n'est pas persistée : une instruction de paiement n'a rien à faire dans le
 * stockage du navigateur, et la page sait la redemander
 * (`GET /orders/:id/payment`) quand elle ne l'a plus — un rechargement, un
 * lien rouvert plus tard.
 */
@Injectable({ providedIn: 'root' })
export class HeldOrderPayment {
  readonly intent = signal<{ orderId: string; payment: OrderPaymentIntent } | null>(null);

  /** Vrai juste après une passation, connecté ou non. */
  holdsPaymentFor(orderId: string): boolean {
    return this.intent()?.orderId === orderId;
  }
}
