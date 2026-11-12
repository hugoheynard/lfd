import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ContactMessagePayload, RequestKind } from '@lfd/contracts';
import type { CustomerAudience, PublicRequestReasonView } from '@lfd/contracts/shop-values';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { GestureIntents, intentOptions, withIntent } from '../gesture-intents';

/**
 * **« Nous écrire »**, côté réseau (`documentation/demandes-client/demandes-clients.md`, §2.2).
 *
 * Deux routes d'envoi et non une : `POST /contact-messages` est publique, et le
 * garde du serveur n'y résout aucun principal ; un client connecté écrit donc
 * par `POST /me/contact-messages`, qui prend sa personne au jeton et sa société
 * à l'espace courant (en-tête posé par l'intercepteur) — jamais au corps.
 */
@Injectable({ providedIn: 'root' })
export class ContactGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  /** Les intentions des messages : une par contenu, oubliée au succès. */
  private readonly intents = new GestureIntents();

  /**
   * Les motifs actifs d'un type de demande (« Nous écrire » ou « Signaler un
   * problème »), proposés à ce public, dans l'ordre réglé.
   */
  reasons(kind: RequestKind, audience: CustomerAudience): Promise<PublicRequestReasonView[]> {
    return firstValueFrom(
      this.http.get<PublicRequestReasonView[]>(`${AUTH_CONFIG.apiBaseUrl}/request-reasons`, {
        params: { kind, audience },
      }),
    );
  }

  /** Envoie. Rend `null` au succès (204), sinon le message sûr du refus — ou `''` s'il n'en dit rien. */
  async send(payload: ContactMessagePayload): Promise<string | null> {
    // Une fois par intention, connecté ou visiteur : un double clic ne dépose
    // ni deux demandes ni deux courriels. Le sujet est le contenu : un message
    // corrigé après un refus est une intention neuve.
    const subject = `contact:${JSON.stringify(payload)}`;
    try {
      const key = this.intents.keyFor(subject);
      if (this.auth.isAuthenticated()) {
        const token = await firstValueFrom(this.auth.accessToken$());
        await firstValueFrom(
          this.http.post<void>(`${AUTH_CONFIG.apiBaseUrl}/me/contact-messages`, payload, {
            headers: withIntent(new HttpHeaders({ Authorization: `Bearer ${token}` }), key),
          }),
        );
      } else {
        await firstValueFrom(
          this.http.post<void>(
            `${AUTH_CONFIG.apiBaseUrl}/contact-messages`,
            payload,
            intentOptions(key),
          ),
        );
      }
      this.intents.done(subject);
      return null;
    } catch (error) {
      return httpErrorMessage(error, '');
    }
  }
}
