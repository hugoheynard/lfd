import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ActivationSupportPayload, CreatedIdResponse } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/** Réponse de création d'une demande de support. */
/**
 * Demandes de **support à l'activation** — le client demande à être contacté par
 * l'équipe commerciale. Une simple écriture (pas de rechargement de compte).
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /**
   * Route **unique**, portée par la personne : la société est dans le corps et
   * peut valoir `null` — un prospect qui n'a pas encore déclaré d'entreprise
   * doit pouvoir demander un rappel.
   */
  requestActivation(payload: ActivationSupportPayload): Observable<CreatedIdResponse> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.post<CreatedIdResponse>(
            `${AUTH_CONFIG.apiBaseUrl}/support/activation`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        ),
      );
  }
}
