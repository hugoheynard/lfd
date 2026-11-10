import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CardComplementPaymentView,
  CardIncreasePayload,
  CreatedIdResponse,
  CustomerOrderDetailView,
  OrderChangeRequestPayload,
  OrderChangeRequestStatusResponse,
  OrderChangeRequestStatusView,
  OrderRevisedResponse,
  OrderRevisionPayload,
  OrderRevisionQuotePayload,
  OrderRevisionQuoteView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * Un refus du serveur, tel qu'il l'a dit : le code pour brancher, la phrase
 * pour l'écran — elle est écrite pour le client (`orders.revise.*`). Le
 * refus `orders.total_changed` (le total vu n'est plus le bon, plan S2,
 * R14 bis) passe par le même canal : l'écran le reconnaît à son code.
 */
export interface RevisionRefusal {
  readonly code: string | null;
  /** Vide quand le serveur n'a pas dit de phrase sûre : l'écran prend son repli. */
  readonly message: string;
}

/** Ce que rend un appel : la réponse, un refus (4xx), ou une panne (réseau, 5xx). */
export type RevisionOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'refused'; readonly refusal: RevisionRefusal }
  | { readonly kind: 'failed' };

/** Le refus d'une révision dépassée (R7) : la commande a changé ailleurs. */
export const STALE_REVISION = 'orders.revise.stale_revision';

/**
 * Les refus nommés de la hausse par carte (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.4, §2.5) :
 * un complément attend déjà, le précédent vient d'être payé, le service de
 * paiement ne répond pas. L'écran les dit dans la langue du client.
 */
export const CARD_INCREASE_PENDING = 'orders.card_increase.pending';
export const CARD_INCREASE_JUST_PAID = 'orders.card_increase.just_paid';
export const CARD_INCREASE_PROVIDER_UNAVAILABLE = 'orders.card_increase.provider_unavailable';
/** Plus rien à payer ni à abandonner : payé, abandonné ou expiré. */
export const CARD_INCREASE_NOTHING_TO_PAY = 'orders.card_increase.nothing_to_pay';

/** Le refus d'une demande composée sur une commande qui a changé depuis (M4). */
export const STALE_CHANGE_REQUEST = 'contact.order_change.stale_revision';

/**
 * **Modifier une commande passée**, côté réseau (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1 et M3) : la
 * commande relue, le devis de révision, la révision.
 *
 * Seul `revise` écrit, et seul un clic l'appelle. Le devis ne mute rien
 * (CQRS) : il se rappelle à chaque changement du brouillon.
 */
@Injectable({ providedIn: 'root' })
export class OrderRevisionGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly base = AUTH_CONFIG.apiBaseUrl;

  /** `GET /orders/:id` — la commande telle qu'elle est ; `null` si la lecture échoue. */
  async order(orderId: string): Promise<CustomerOrderDetailView | null> {
    try {
      return await firstValueFrom(
        this.http.get<CustomerOrderDetailView>(this.url(orderId), {
          headers: await this.bearer(),
        }),
      );
    } catch {
      return null;
    }
  }

  /** `POST /orders/:id/revisions/quote` — la commande telle qu'elle serait. */
  quote(
    orderId: string,
    payload: OrderRevisionQuotePayload,
  ): Promise<RevisionOutcome<OrderRevisionQuoteView>> {
    return this.post<OrderRevisionQuoteView>(`${this.url(orderId)}/revisions/quote`, payload);
  }

  /**
   * `POST /orders/:id/revisions/change-request-quote` — après l'heure limite,
   * ce que la DEMANDE coûterait (M4, §14) : un devis indicatif, que l'équipe
   * recalculera en l'appliquant.
   */
  changeQuote(
    orderId: string,
    payload: OrderRevisionQuotePayload,
  ): Promise<RevisionOutcome<OrderRevisionQuoteView>> {
    return this.post<OrderRevisionQuoteView>(
      `${this.url(orderId)}/revisions/change-request-quote`,
      payload,
    );
  }

  /**
   * `POST /orders/:id/revisions` — la modification, avec la révision qu'elle
   * corrige et le total que le client a vu (`expectedTotalCents`, R14).
   */
  revise(
    orderId: string,
    payload: OrderRevisionPayload,
  ): Promise<RevisionOutcome<OrderRevisedResponse>> {
    return this.post<OrderRevisedResponse>(`${this.url(orderId)}/revisions`, payload);
  }

  /**
   * `POST /orders/:id/revisions/card-increase` — la hausse d'une commande
   * payée par carte (plan S2, §2.4) : le même corps que `revise`, et la
   * réponse porte de quoi payer le complément. La commande ne change qu'une
   * fois le complément payé.
   */
  proposeCardIncrease(
    orderId: string,
    payload: CardIncreasePayload,
  ): Promise<RevisionOutcome<CardComplementPaymentView>> {
    return this.post<CardComplementPaymentView>(
      `${this.url(orderId)}/revisions/card-increase`,
      payload,
    );
  }

  /**
   * `GET /orders/:id/complement` — le complément qui attend son paiement, pour
   * reprendre le formulaire au rechargement (§2.5) ; `null` s'il n'y en a pas
   * (409 `nothing_to_pay`) ou si la lecture échoue : l'écran reprend la
   * modification d'une commande telle qu'elle est.
   */
  async complement(orderId: string): Promise<CardComplementPaymentView | null> {
    try {
      return await firstValueFrom(
        this.http.get<CardComplementPaymentView>(`${this.url(orderId)}/complement`, {
          headers: await this.bearer(),
        }),
      );
    } catch {
      return null;
    }
  }

  /** `DELETE /orders/:id/complement` — abandonner le complément ; la commande reste telle quelle. */
  async abandonComplement(orderId: string): Promise<RevisionOutcome<null>> {
    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.url(orderId)}/complement`, {
          headers: await this.bearer(),
        }),
      );
      return { kind: 'ok', value: null };
    } catch (error) {
      return outcomeOfError(error);
    }
  }

  /**
   * `POST /me/orders/:id/change-request` — après l'heure limite, DEMANDER la
   * modification (M4) : la commande voulue, la révision sur laquelle elle a
   * été composée, et un mot facultatif.
   */
  requestChange(
    orderId: string,
    payload: OrderChangeRequestPayload,
  ): Promise<RevisionOutcome<CreatedIdResponse>> {
    return this.post<CreatedIdResponse>(`${this.meUrl(orderId)}/change-request`, payload);
  }

  /** `GET /me/orders/:id/change-request` — la dernière demande ; `null` sans demande ou en échec. */
  async changeRequest(orderId: string): Promise<OrderChangeRequestStatusView | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<OrderChangeRequestStatusResponse>(`${this.meUrl(orderId)}/change-request`, {
          headers: await this.bearer(),
        }),
      );
      return response.request;
    } catch {
      return null;
    }
  }

  private meUrl(orderId: string): string {
    return `${this.base}/me/orders/${encodeURIComponent(orderId)}`;
  }

  private async post<T>(url: string, body: object): Promise<RevisionOutcome<T>> {
    try {
      const value = await firstValueFrom(
        this.http.post<T>(url, body, { headers: await this.bearer() }),
      );
      return { kind: 'ok', value };
    } catch (error) {
      return outcomeOfError(error);
    }
  }

  private url(orderId: string): string {
    return `${this.base}/orders/${encodeURIComponent(orderId)}`;
  }

  private async bearer(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

/** Un 4xx est un refus qui se dit ; le reste est une panne, qui se réessaie. */
function outcomeOfError(error: unknown):
  | { kind: 'refused'; refusal: RevisionRefusal }
  | {
      kind: 'failed';
    } {
  if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500) {
    return {
      kind: 'refused',
      refusal: { code: httpErrorCode(error), message: httpErrorMessage(error, '') },
    };
  }
  return { kind: 'failed' };
}
