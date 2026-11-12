import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CreatedIdResponse } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, withIntent } from '../gesture-intents';

/** Ce que le client signale : un motif `order_problem`, un mot facultatif, des photos. */
export interface OrderProblemDraft {
  readonly reasonId: string;
  readonly message: string;
  readonly photos: readonly File[];
}

/**
 * **« Signaler un problème »**, côté réseau
 * (`documentation/demandes-client/demandes-clients.md`, §3.2 et §7).
 *
 * `POST /me/orders/:orderId/problems` en multipart : le serveur prend nom et
 * e-mail au compte, vérifie que la commande est celle de l'acteur (404 sinon)
 * et qu'elle est retirée ou livrée (409 sinon).
 */
@Injectable({ providedIn: 'root' })
export class OrderProblemGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /** Les intentions des signalements : une par contenu, oubliée au succès. */
  private readonly intents = new GestureIntents();

  /** Rend `null` au succès, sinon le message sûr du refus — ou `''` s'il n'en dit rien. */
  async report(orderId: string, draft: OrderProblemDraft): Promise<string | null> {
    const body = new FormData();
    body.append('reasonId', draft.reasonId);
    if (draft.message !== '') {
      body.append('message', draft.message);
    }
    for (const photo of draft.photos) {
      body.append('photos', photo, photo.name);
    }
    // Une fois par intention : la clé suit le signalement tant qu'il n'a pas
    // abouti — un double clic ne dépose pas deux demandes.
    const subject = problemSubject(orderId, draft);
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      await firstValueFrom(
        this.http.post<CreatedIdResponse>(
          `${AUTH_CONFIG.apiBaseUrl}/me/orders/${encodeURIComponent(orderId)}/problems`,
          body,
          {
            headers: withIntent(
              new HttpHeaders({ Authorization: `Bearer ${token}` }),
              this.intents.keyFor(subject),
            ),
          },
        ),
      );
      this.intents.done(subject);
      return null;
    } catch (error) {
      return httpErrorMessage(error, '');
    }
  }
}

/** Ce qui distingue un signalement d'un autre : la commande, le motif, le texte et les photos. */
function problemSubject(orderId: string, draft: OrderProblemDraft): string {
  const photos = draft.photos.map((photo) => `${photo.name}:${photo.size}`).join(',');
  return `problem:${orderId}:${draft.reasonId}:${draft.message}:${photos}`;
}
