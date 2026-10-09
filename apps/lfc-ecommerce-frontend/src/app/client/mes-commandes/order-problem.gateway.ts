import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/** Ce que le client signale : un motif `order_problem`, un mot facultatif, des photos. */
export interface OrderProblemDraft {
  readonly reasonId: string;
  readonly message: string;
  readonly photos: readonly File[];
}

/**
 * **« Signaler un problème »**, côté réseau
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §3.2 et §7).
 *
 * `POST /me/orders/:orderId/problems` en multipart : le serveur prend nom et
 * e-mail au compte, vérifie que la commande est celle de l'acteur (404 sinon)
 * et qu'elle est retirée ou livrée (409 sinon).
 */
@Injectable({ providedIn: 'root' })
export class OrderProblemGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

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
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      await firstValueFrom(
        this.http.post<{ id: string }>(
          `${AUTH_CONFIG.apiBaseUrl}/me/orders/${encodeURIComponent(orderId)}/problems`,
          body,
          { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
        ),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error, '');
    }
  }
}
