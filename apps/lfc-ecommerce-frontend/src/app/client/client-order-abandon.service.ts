import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { httpErrorCode } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/**
 * Ce que l'écran peut dire après avoir TENTÉ l'abandon — trois issues, et
 * aucune ne retient le client.
 *
 * - `abandoned` : le serveur a écrit l'abandon (204, second clic compris) ;
 * - `settled` : de l'argent est pris ou en route (`already_paid`,
 *   `payment_in_progress`), ou la commande n'attendait aucune carte — la dire
 *   « annulée » serait faux ;
 * - `unsettled` : rien n'a été écrit — Stripe injoignable, réseau, refus de
 *   l'auteur, visiteur sans compte. La commande reste en attente, et la clôture
 *   de sa journée la balaiera (plan `plan-abandon-du-reglement.md`, §5).
 */
export type AbandonOutcome = 'abandoned' | 'settled' | 'unsettled';

/** Les refus qui disent que le paiement a abouti ou aboutit (vérifié le 2026-09-26). */
const SETTLED_CODES: ReadonlySet<string> = new Set([
  'orders.abandon.already_paid',
  'orders.abandon.payment_in_progress',
  'orders.abandon.not_abandonable',
]);

/**
 * **Abandonner le règlement** d'une commande — `POST /orders/:id/abandon`.
 *
 * Ne lève jamais : l'écran navigue QUOI QU'IL ARRIVE (plan, §5 « Sortir quand
 * Stripe est injoignable »), et n'a besoin que de savoir quoi annoncer. Rangé
 * hors de `ClientOrders`, déjà au-delà des 600 lignes.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrderAbandon {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  async abandon(orderId: string): Promise<AbandonOutcome> {
    // Un visiteur sans compte n'atteint pas la route murée : rien ne s'écrit,
    // la clôture balaiera sa commande comme une autre.
    if (!this.auth.isAuthenticated()) {
      return 'unsettled';
    }
    try {
      await firstValueFrom(
        this.auth.accessToken$().pipe(
          switchMap((token) =>
            this.http.post<void>(`${AUTH_CONFIG.apiBaseUrl}/orders/${orderId}/abandon`, null, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        ),
      );
      return 'abandoned';
    } catch (error) {
      const code = httpErrorCode(error);
      return code !== null && SETTLED_CODES.has(code) ? 'settled' : 'unsettled';
    }
  }
}
