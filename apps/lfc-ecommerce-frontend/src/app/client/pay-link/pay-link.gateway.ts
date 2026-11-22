import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PayLinkIntent, PayLinkView } from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/** Le lien n'existe pas, ou plus : inconnu, révoqué, ou de forme fausse. */
type NotFound = { readonly kind: 'not_found' };
/** Le réseau ou le serveur n'a pas répondu : le lien, lui, n'est pas en cause. */
type Failed = { readonly kind: 'failed' };

export type PayLinkViewResult =
  { readonly kind: 'ready'; readonly view: PayLinkView } | NotFound | Failed;

export type PayLinkIntentResult =
  | { readonly kind: 'ready'; readonly intent: PayLinkIntent }
  | NotFound
  /** `409 pay_link.subject.not_payable` : réglé ou annulé entre-temps. */
  | { readonly kind: 'not_payable' }
  /** `409 pay_link.intent.closed` : le prestataire ne reprend plus ce paiement. */
  | { readonly kind: 'closed' }
  | Failed;

/**
 * **La page publique d'un lien de paiement**, côté réseau (plan
 * `documentation/comptabilite/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.3). Sans session : le payeur n'a pas de compte.
 *
 * Le jeton voyage dans le CORPS d'un `POST`, jamais dans une adresse d'API,
 * pour ne pas finir dans un journal.
 */
@Injectable({ providedIn: 'root' })
export class PayLinkGateway {
  private readonly http = inject(HttpClient);
  private readonly base = AUTH_CONFIG.apiBaseUrl;

  /** `POST /pay-links/view`. */
  async view(token: string): Promise<PayLinkViewResult> {
    try {
      const view = await firstValueFrom(
        this.http.post<PayLinkView>(`${this.base}/pay-links/view`, { token }),
      );
      return { kind: 'ready', view };
    } catch (error) {
      return isNotFound(error) ? { kind: 'not_found' } : { kind: 'failed' };
    }
  }

  /** `POST /pay-links/intent` — de quoi faire payer. */
  async intent(token: string): Promise<PayLinkIntentResult> {
    try {
      const intent = await firstValueFrom(
        this.http.post<PayLinkIntent>(`${this.base}/pay-links/intent`, { token }),
      );
      return { kind: 'ready', intent };
    } catch (error) {
      if (isNotFound(error)) {
        return { kind: 'not_found' };
      }
      if (error instanceof HttpErrorResponse && error.status === 409) {
        return httpErrorCode(error) === 'pay_link.intent.closed'
          ? { kind: 'closed' }
          : { kind: 'not_payable' };
      }
      return { kind: 'failed' };
    }
  }
}

/**
 * `404` (inconnu ou révoqué) et `400` (un jeton de forme fausse : le seul champ
 * du corps) disent la même chose au payeur — ce lien ne mène à rien.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400);
}
