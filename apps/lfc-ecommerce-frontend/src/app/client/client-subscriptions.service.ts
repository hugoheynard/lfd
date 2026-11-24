import { HttpClient, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import type {
  SubscriptionLineView,
  SubscriptionStatus,
  SubscriptionView,
  UpsertOccurrenceOverridePayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est la lecture de la liste. */
export type SubscriptionsStatus = 'idle' | 'loading' | 'failed' | 'ready';

/**
 * **Les paniers récurrents du client** (`GET /subscriptions/mine`) et leurs
 * gestes : pause, reprise, arrêt, et la dérogation d'une échéance (sauter,
 * modifier, rétablir).
 *
 * Le mur est la personne connectée : aucune route ne dépend de l'espace
 * affiché, la liste n'a donc pas de clé d'espace. Le menu en tire son compte,
 * la page `/paniers-recurrents` ses cartes.
 *
 * Les gestes sont idempotents côté serveur (`@Idempotent` sur chaque route,
 * lu dans `subscriptions.controller.ts` le 2026-11-24) : aucun n'a de clé
 * d'intention. Chacun rend `null` sur un succès — la liste est alors relue —,
 * ou la phrase du refus.
 */
@Injectable({ providedIn: 'root' })
export class ClientSubscriptions {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly rows = signal<readonly SubscriptionView[]>([]);
  private readonly state = signal<SubscriptionsStatus>('idle');

  /** Les paniers, tels que notre base les porte. Vide sans compte reconnu. */
  readonly all = this.rows.asReadonly();
  readonly status = this.state.asReadonly();

  private asked = false;

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated() || this.asked) {
        return;
      }
      this.asked = true;
      void this.reload();
    });
  }

  /** Pose une liste déjà obtenue — les suites s'en servent au lieu de doubler. */
  receive(subscriptions: readonly SubscriptionView[]): void {
    this.rows.set(subscriptions);
    this.state.set('ready');
    this.asked = true;
  }

  /** Relit la liste. Un échec est un état : la page le dit, le menu se tait. */
  async reload(): Promise<void> {
    if (this.state() !== 'ready') {
      this.state.set('loading');
    }
    try {
      const rows = await this.call((headers) =>
        this.http.get<readonly SubscriptionView[]>(this.url('/mine'), { headers }),
      );
      this.rows.set(rows);
      this.state.set('ready');
    } catch {
      this.state.set('failed');
      this.asked = false;
    }
  }

  /** Met en pause ou reprend un panier. */
  setStatus(id: string, status: SubscriptionStatus): Promise<string | null> {
    return this.gesture((headers) =>
      this.http.patch<void>(this.url(`/${id}/status`), { status }, { headers }),
    );
  }

  /** Arrête un panier : il ne sert plus, et quitte la liste. */
  stop(id: string): Promise<string | null> {
    return this.gesture((headers) => this.http.delete<void>(this.url(`/${id}`), { headers }));
  }

  /** Saute l'échéance de ce jour (`AAAA-MM-JJ`). */
  skip(id: string, day: string): Promise<string | null> {
    return this.override(id, day, { skipped: true, lines: [], note: '' });
  }

  /** Remplace les lignes de l'échéance de ce jour seulement. */
  modify(
    id: string,
    day: string,
    lines: readonly SubscriptionLineView[],
    note: string,
  ): Promise<string | null> {
    return this.override(id, day, { skipped: false, lines: [...lines], note });
  }

  /** Ramène l'échéance de ce jour au panier habituel. */
  restore(id: string, day: string): Promise<string | null> {
    return this.gesture((headers) =>
      this.http.delete<void>(this.url(`/${id}/occurrences/${day}`), { headers }),
    );
  }

  private override(
    id: string,
    day: string,
    payload: UpsertOccurrenceOverridePayload,
  ): Promise<string | null> {
    return this.gesture((headers) =>
      this.http.put<void>(this.url(`/${id}/occurrences/${day}`), payload, { headers }),
    );
  }

  private async gesture(send: (headers: HttpHeaders) => Observable<void>): Promise<string | null> {
    try {
      await this.call(send);
    } catch (error) {
      return httpErrorMessage(error);
    }
    await this.reload();
    return null;
  }

  private async call<T>(send: (headers: HttpHeaders) => Observable<T>): Promise<T> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(send(new HttpHeaders({ Authorization: `Bearer ${token}` })));
  }

  private url(path: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/subscriptions${path}`;
  }
}
