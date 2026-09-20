import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AppointmentView,
  BookAppointmentPayload,
  CreatedAppointmentResponse,
  SlotsView,
} from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

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
  private readonly base = `${AUTH_CONFIG.apiBaseUrl}/appointments`;

  /** Les créneaux réservables entre deux jours locaux (`AAAA-MM-JJ`). */
  slots(from: string, to: string): Observable<SlotsView> {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.authed((headers) =>
      this.http.get<SlotsView>(`${this.base}/slots?${query}`, { headers }),
    );
  }

  book(payload: BookAppointmentPayload): Observable<CreatedAppointmentResponse> {
    return this.authed((headers) =>
      this.http.post<CreatedAppointmentResponse>(this.base, payload, { headers }),
    );
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
