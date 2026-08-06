import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  CreateSubscriptionPayload,
  SubscriptionView,
  UpsertOccurrenceOverridePayload,
} from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Ce que la création renvoie. */
interface CreatedSubscription {
  readonly id: string;
}

/**
 * **Paniers récurrents** (abonnements) du client connecté — gabarits de commande
 * répétés (`/subscriptions`, mur = le seul client connecté). Front mince au-dessus
 * du backend : `create` depuis une commande, `loadMine` pour la liste.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly _list = signal<readonly SubscriptionView[]>([]);
  readonly list = this._list.asReadonly();

  /** Crée un panier récurrent (le plus souvent depuis une commande). */
  create(payload: CreateSubscriptionPayload): Observable<CreatedSubscription> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.post<CreatedSubscription>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions`,
            payload,
            headers(token),
          ),
        ),
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
