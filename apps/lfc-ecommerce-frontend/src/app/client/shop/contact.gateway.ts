import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ContactMessagePayload } from '@lfd/contracts';
import type { CustomerAudience, PublicContactSubjectView } from '@lfd/contracts/shop-values';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * **« Nous écrire »**, côté réseau (`documentation/contenu-ecommerce/nous-contacter.md`, §2.2).
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

  /** Les objets actifs proposés à ce public, dans l'ordre réglé. */
  subjects(audience: CustomerAudience): Promise<PublicContactSubjectView[]> {
    return firstValueFrom(
      this.http.get<PublicContactSubjectView[]>(`${AUTH_CONFIG.apiBaseUrl}/contact-subjects`, {
        params: { audience },
      }),
    );
  }

  /** Envoie. Rend `null` au succès (204), sinon le message sûr du refus — ou `''` s'il n'en dit rien. */
  async send(payload: ContactMessagePayload): Promise<string | null> {
    try {
      if (this.auth.isAuthenticated()) {
        const token = await firstValueFrom(this.auth.accessToken$());
        await firstValueFrom(
          this.http.post<void>(`${AUTH_CONFIG.apiBaseUrl}/me/contact-messages`, payload, {
            headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
          }),
        );
      } else {
        await firstValueFrom(
          this.http.post<void>(`${AUTH_CONFIG.apiBaseUrl}/contact-messages`, payload),
        );
      }
      return null;
    } catch (error) {
      return httpErrorMessage(error, '');
    }
  }
}
