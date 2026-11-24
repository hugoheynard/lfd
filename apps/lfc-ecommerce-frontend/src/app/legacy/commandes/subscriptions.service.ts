import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CreateSubscriptionPayload, CreatedIdResponse } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientSubscriptions } from '../../client/client-subscriptions.service';
import { GestureIntents, INTENT_KEY_HEADER } from '../../client/gesture-intents';

/**
 * **Paniers récurrents** (abonnements) du client connecté — gabarits de commande
 * répétés (`/subscriptions`, mur = le seul client connecté). Front mince au-dessus
 * du backend : `create` depuis une commande. La liste et ses gestes vivent
 * dans `ClientSubscriptions`, que la création fait relire.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly mine = inject(ClientSubscriptions);
  /** Les intentions des créations : une clé par contenu, oubliée au succès. */
  private readonly intents = new GestureIntents();

  /**
   * Crée un panier récurrent (le plus souvent depuis une commande), une fois
   * par intention : la clé suit le contenu tant que la création n'a pas abouti.
   */
  create(payload: CreateSubscriptionPayload): Observable<CreatedIdResponse> {
    const subject = `subscription:${JSON.stringify(payload)}`;
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.post<CreatedIdResponse>(`${AUTH_CONFIG.apiBaseUrl}/subscriptions`, payload, {
          headers: { ...headers(token).headers, [INTENT_KEY_HEADER]: this.intents.keyFor(subject) },
        }),
      ),
      tap(() => {
        this.intents.done(subject);
        void this.mine.reload();
      }),
    );
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}
