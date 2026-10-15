import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';

/** Le lecteur anonyme : la route publique, qui ne sert que les points des particuliers. */
export const VISITOR = 'visiteur';

/**
 * **La liste des points de retrait, pour qui regarde** (Hugo, 2026-10-15 :
 * « c'est devenu un choix business », la liste est filtrée AU SERVEUR).
 *
 * Un visiteur lit `GET /pickup-addresses` (les points des particuliers) ; un
 * client reconnu lit `GET /pickup-addresses/mine`, ceux de la clientèle de
 * son espace. Aucun identifiant de société dans l'URL : l'espace part dans
 * l'en-tête que pose `workspaceInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class PickupListGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  /** {@link VISITOR}, l'espace de la personne reconnue, ou `null` tant qu'il n'est pas connu. */
  readerKey(): string | null {
    return this.auth.isAuthenticated() ? this.workspace.current() : VISITOR;
  }

  /** Les points de CE lecteur. */
  pickupsOf(reader: string): Promise<readonly PickupAddressView[]> {
    const base = AUTH_CONFIG.apiBaseUrl;
    if (reader === VISITOR) {
      return firstValueFrom(
        this.http.get<readonly PickupAddressView[]>(`${base}/pickup-addresses`),
      );
    }
    return firstValueFrom(
      this.auth.accessToken$().pipe(
        switchMap((token) =>
          this.http.get<readonly PickupAddressView[]>(`${base}/pickup-addresses/mine`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      ),
    );
  }
}
