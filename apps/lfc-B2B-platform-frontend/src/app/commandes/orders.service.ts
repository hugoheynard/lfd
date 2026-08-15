import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type { OrderPaymentIntent, OrderView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est le chargement des commandes personnelles. */
export type OrdersStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Commandes **personnelles** du client connecté — les commandes « zéro friction »
 * passées **sans entreprise** (`GET /orders/mine`, mur = le seul client connecté).
 *
 * C'est la source de vérité de « Mes commandes » quand la personne n'a pas
 * d'entreprise : elle voit ses vraies commandes, sans devoir en créer une.
 * Un échec de chargement est un **état de page** (pas un toast) : l'écran affiche
 * « impossible de charger » plutôt qu'un message fugace.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly state = signal<readonly OrderView[]>([]);
  private readonly _status = signal<OrdersStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly orders = this.state.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  /** Vrai quand on **sait** qu'il n'y a aucune commande (pas avant la réponse). */
  readonly isEmpty = computed(() => this._status() === 'ready' && this.state().length === 0);

  /**
   * Une commande par identifiant (`GET /orders/:id`), pour la page de détail.
   *
   * **Pas** une lecture dans la liste déjà chargée : un lien direct ou un
   * rafraîchissement n'a pas de liste, et une commande d'entreprise n'y figure
   * de toute façon pas — c'est le serveur qui décide si on a le droit de la
   * voir. L'état de page (chargement, erreur) appartient à l'écran, pas au
   * service : deux détails ouverts ne partagent rien.
   */
  async byId(id: string): Promise<OrderView> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(
      this.http.get<OrderView>(`${AUTH_CONFIG.apiBaseUrl}/orders/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  /**
   * De quoi **régler** une commande laissée en attente (`GET /orders/:id/payment`).
   *
   * Le `clientSecret` n'est jamais dans `OrderView` : il ne descend que lorsque
   * le client demande explicitement à payer. C'est la cible du lien qu'un
   * commercial transmet après avoir saisi une commande au téléphone.
   */
  async paymentFor(id: string): Promise<OrderPaymentIntent> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(
      this.http.get<OrderPaymentIntent>(
        `${AUTH_CONFIG.apiBaseUrl}/orders/${encodeURIComponent(id)}/payment`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );
  }

  /** (Re)charge les commandes personnelles. Idempotent : relance depuis l'écran. */
  load(): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<readonly OrderView[]>(`${AUTH_CONFIG.apiBaseUrl}/orders/mine`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      )
      .subscribe({
        next: (orders) => {
          this.state.set(orders);
          this._status.set('ready');
          this._error.set(null);
        },
        error: (error: unknown) => {
          this._status.set('error');
          this._error.set(httpErrorMessage(error));
        },
      });
  }
}
