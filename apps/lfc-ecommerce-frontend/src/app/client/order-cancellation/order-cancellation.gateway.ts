import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CustomerOrderDetailView,
  GuestOrderCancellationView,
  OrderCancellability,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import type { CancelOutcome, CancelReason, GuestLink } from './cancellation-wording';

/** Ce que rend la lecture de la page invité : la commande, ou pourquoi il n'y en a pas. */
export type GuestViewResult =
  | { readonly kind: 'ready'; readonly view: GuestOrderCancellationView }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'failed' };

/**
 * **L'annulation d'une commande par le client**, côté réseau (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.4,
 * C6.6, C6.8).
 *
 * Deux portes, une forme de réponse : le titulaire d'un compte passe par sa
 * session (`/orders/:id`), l'invité par son lien (`/shop/orders/cancellation/*`),
 * le jeton dans le CORPS — jamais dans un chemin ni une query (S7).
 *
 * Aucune méthode n'annule sur une lecture : seul `cancel` / `confirm` écrit, et
 * seul un clic les appelle.
 */
@Injectable({ providedIn: 'root' })
export class OrderCancellationGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly base = AUTH_CONFIG.apiBaseUrl;

  /**
   * Si la commande s'annule, relu sur `GET /orders/:id` — une indication, pas
   * une promesse : le `POST` relit tout sous verrou. `null` si la lecture échoue.
   */
  async cancellability(orderId: string): Promise<OrderCancellability | null> {
    try {
      const detail = await firstValueFrom(
        this.http.get<CustomerOrderDetailView>(
          `${this.base}/orders/${encodeURIComponent(orderId)}`,
          { headers: await this.bearer() },
        ),
      );
      return detail.cancellability;
    } catch {
      return null;
    }
  }

  /** `POST /orders/:id/cancel` — `204`, ou le refus nommé. */
  async cancel(orderId: string, reason: CancelReason): Promise<CancelOutcome> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${this.base}/orders/${encodeURIComponent(orderId)}/cancel`, reason, {
          headers: await this.bearer(),
        }),
      );
      return { kind: 'done' };
    } catch (error) {
      return outcomeOf(error);
    }
  }

  /** `POST /shop/orders/cancellation/view` — la page de l'invité. */
  async guestView(link: GuestLink): Promise<GuestViewResult> {
    try {
      const view = await firstValueFrom(
        this.http.post<GuestOrderCancellationView>(`${this.base}/shop/orders/cancellation/view`, {
          orderId: link.orderId,
          token: link.token,
        }),
      );
      return { kind: 'ready', view };
    } catch (error) {
      return isNotFound(error) ? { kind: 'not_found' } : { kind: 'failed' };
    }
  }

  /** `POST /shop/orders/cancellation/confirm` — l'annulation de l'invité, au clic. */
  async guestConfirm(link: GuestLink, reason: CancelReason): Promise<CancelOutcome> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${this.base}/shop/orders/cancellation/confirm`, {
          orderId: link.orderId,
          token: link.token,
          ...reason,
        }),
      );
      return { kind: 'done' };
    } catch (error) {
      return outcomeOf(error);
    }
  }

  private async bearer(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}

function outcomeOf(error: unknown): CancelOutcome {
  if (isNotFound(error)) {
    return { kind: 'not_found' };
  }
  return { kind: 'refused', errorCode: httpErrorCode(error), message: httpErrorMessage(error, '') };
}
