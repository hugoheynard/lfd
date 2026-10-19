import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/**
 * **Les points de retrait ouverts aux pros, pour un visiteur** — ce que lit
 * l'accueil pro public (`/pro`, Hugo, 2026-10-19).
 *
 * Route publique, sans jeton : `GET /pickup-addresses?audience=pro`. Écrit à
 * côté de `PickupListGateway` plutôt qu'en lui : celui-ci choisit sa route
 * selon la personne reconnue, et `/pro` ne doit dépendre d'aucun statut.
 */
@Injectable({ providedIn: 'root' })
export class ProPickupListGateway {
  private readonly http = inject(HttpClient);

  list(): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${AUTH_CONFIG.apiBaseUrl}/pickup-addresses`, {
        params: { audience: 'pro' },
      }),
    );
  }
}
