import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ActivationSupportPayload, CreatedIdResponse } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, INTENT_KEY_HEADER } from '../../client/gesture-intents';

/** Réponse de création d'une demande de support. */
/**
 * Demandes de **support à l'activation** — le client demande à être contacté par
 * l'équipe commerciale. Une simple écriture (pas de rechargement de compte).
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /** Les intentions des demandes : une clé par contenu, oubliée au succès — un double clic ne demande pas deux rappels. */
  private readonly intents = new GestureIntents();

  /**
   * Route **unique**, portée par la personne : la société est dans le corps et
   * peut valoir `null` — un prospect qui n'a pas encore déclaré d'entreprise
   * doit pouvoir demander un rappel.
   */
  requestActivation(payload: ActivationSupportPayload): Observable<CreatedIdResponse> {
    const subject = `support:${JSON.stringify(payload)}`;
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.post<CreatedIdResponse>(`${AUTH_CONFIG.apiBaseUrl}/support/activation`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            [INTENT_KEY_HEADER]: this.intents.keyFor(subject),
          },
        }),
      ),
      tap(() => this.intents.done(subject)),
    );
  }
}
