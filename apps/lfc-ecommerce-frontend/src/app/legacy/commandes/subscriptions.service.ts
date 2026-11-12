import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  CreateSubscriptionPayload,
  CreatedIdResponse,
  SubscriptionStatus,
  SubscriptionView,
  UpsertOccurrenceOverridePayload,
} from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, INTENT_KEY_HEADER } from '../../client/gesture-intents';

/** Ce que la création renvoie. */
/**
 * **Paniers récurrents** (abonnements) du client connecté — gabarits de commande
 * répétés (`/subscriptions`, mur = le seul client connecté). Front mince au-dessus
 * du backend : `create` depuis une commande, `loadMine` pour la liste.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /** Les intentions des créations : une clé par contenu, oubliée au succès. */
  private readonly intents = new GestureIntents();

  private readonly _list = signal<readonly SubscriptionView[]>([]);
  readonly list = this._list.asReadonly();

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
      tap(() => this.intents.done(subject)),
    );
  }

  /**
   * Déroge à une **échéance précise** (« modifier cette commande uniquement ») :
   * on saute la date ou on remplace ses lignes. `date` = `AAAA-MM-JJ`.
   */
  upsertOccurrence(
    subscriptionId: string,
    date: string,
    payload: UpsertOccurrenceOverridePayload,
  ): Observable<void> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.put<void>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions/${subscriptionId}/occurrences/${date}`,
            payload,
            headers(token),
          ),
        ),
      );
  }

  /** Met en pause / reprend un panier récurrent. */
  setStatus(subscriptionId: string, status: SubscriptionStatus): Observable<void> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.patch<void>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions/${subscriptionId}/status`,
            { status },
            headers(token),
          ),
        ),
      );
  }

  /** Supprime un panier récurrent. */
  remove(subscriptionId: string): Observable<void> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.delete<void>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions/${subscriptionId}`,
            headers(token),
          ),
        ),
      );
  }

  /** (Re)charge les paniers récurrents du client dans l'état. */
  loadMine(): void {
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<readonly SubscriptionView[]>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions/mine`,
            headers(token),
          ),
        ),
      )
      .subscribe({
        next: (subscriptions) => this._list.set(subscriptions),
        error: () => this._list.set([]),
      });
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}
