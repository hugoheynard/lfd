import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AppointmentView,
  BookAppointmentPayload,
  CreatedAppointmentResponse,
  SlotsView,
} from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, INTENT_KEY_HEADER } from '../../client/gesture-intents';

/**
 * **Prise de rendez-vous** côté client : les créneaux réellement ouverts, la
 * réservation, et ses propres rendez-vous.
 *
 * Pas de `companyId` dans l'URL, contrairement au support d'activation : un
 * rendez-vous n'est pas muré par la société — la société éventuelle voyage dans
 * le corps, et le serveur vérifie l'appartenance.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /** Les intentions des réservations : une clé par contenu, oubliée au succès. */
  private readonly intents = new GestureIntents();
  private readonly base = `${AUTH_CONFIG.apiBaseUrl}/appointments`;

  /** Les créneaux réservables entre deux jours locaux (`AAAA-MM-JJ`). */
  slots(from: string, to: string): Observable<SlotsView> {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.authed((headers) =>
      this.http.get<SlotsView>(`${this.base}/slots?${query}`, { headers }),
    );
  }

  /** Une fois par intention : un double clic ne prend pas deux rendez-vous. */
  book(payload: BookAppointmentPayload): Observable<CreatedAppointmentResponse> {
    const subject = `appointment:${JSON.stringify(payload)}`;
    return this.authed((headers) =>
      this.http.post<CreatedAppointmentResponse>(this.base, payload, {
        headers: { ...headers, [INTENT_KEY_HEADER]: this.intents.keyFor(subject) },
      }),
    ).pipe(tap(() => this.intents.done(subject)));
  }

  mine(): Observable<readonly AppointmentView[]> {
    return this.authed((headers) =>
      this.http.get<readonly AppointmentView[]>(`${this.base}/mine`, { headers }),
    );
  }

  cancel(id: string): Observable<void> {
    return this.authed((headers) => this.http.delete<void>(`${this.base}/${id}`, { headers }));
  }

  /** Enveloppe commune : on n'appelle qu'avec un jeton frais. */
  private authed<T>(call: (headers: Record<string, string>) => Observable<T>): Observable<T> {
    return this.auth
      .accessToken$()
      .pipe(switchMap((token) => call({ Authorization: `Bearer ${token}` })));
  }
}
