import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MyShopQuoteView,
  OpenPlannedColumnPayload,
  PlannedColumnOpened,
  PlannedColumnWritten,
  PlannerView,
  PutPlannedColumnPayload,
  ShopQuotePayload,
} from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, withIntent } from '../gesture-intents';

/**
 * **Le planificateur, côté réseau** (plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * § 3.2 et § 6.1) — `GET /planner`, l'ouverture, l'écriture et le retrait
 * d'une colonne, et le devis d'une case.
 *
 * La société est celle de l'espace qui s'affiche : l'intercepteur d'espace
 * pose l'en-tête, et le serveur refuse l'espace personnel.
 *
 * L'ouverture est une route « par intention » : la clé tient au jour et au
 * créneau, et se renvoie tant que l'ouverture n'a pas abouti. L'écriture et le
 * retrait sont idempotents par l'état visé.
 */
@Injectable({ providedIn: 'root' })
export class ClientPlanner {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly intents = new GestureIntents();

  read(from: string): Promise<PlannerView> {
    return this.call((headers) =>
      this.http.get<PlannerView>(this.url(''), { headers, params: { from } }),
    );
  }

  /** Ouvre la colonne d'un jour sur un créneau ; redemander la même rend celle qui existe. */
  async open(payload: OpenPlannedColumnPayload): Promise<PlannedColumnOpened> {
    const subject = `${payload.day}|${payload.routing.window.start ?? ''}-${payload.routing.window.end}`;
    const key = this.intents.keyFor(subject);
    const opened = await this.call((headers) =>
      this.http.post<PlannedColumnOpened>(this.url('/columns'), payload, {
        headers: withIntent(headers, key),
      }),
    );
    this.intents.done(subject);
    return opened;
  }

  write(id: string, payload: PutPlannedColumnPayload): Promise<PlannedColumnWritten> {
    return this.call((headers) =>
      this.http.put<PlannedColumnWritten>(this.url(`/columns/${encodeURIComponent(id)}`), payload, {
        headers,
      }),
    );
  }

  withdraw(id: string): Promise<void> {
    return this.call((headers) =>
      this.http.delete<void>(this.url(`/columns/${encodeURIComponent(id)}`), { headers }),
    );
  }

  /**
   * Le total HT d'une case, au devis de la boutique — la même arithmétique que
   * la commande (§ 1, règle 2). Indicatif : le prix facturé est celui du jour
   * de la conversion.
   */
  async quote(payload: ShopQuotePayload): Promise<number> {
    const view = await this.call((headers) =>
      this.http.post<MyShopQuoteView>(`${AUTH_CONFIG.apiBaseUrl}/shop/quote/mine`, payload, {
        headers,
      }),
    );
    return view.pretaxCents;
  }

  private async call<T>(send: (headers: HttpHeaders) => Observable<T>): Promise<T> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(send(new HttpHeaders({ Authorization: `Bearer ${token}` })));
  }

  private url(path: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/planner${path}`;
  }
}
