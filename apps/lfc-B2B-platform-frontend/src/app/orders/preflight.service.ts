import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import type { OrderPreflightPayload, OrderPreflightView } from '@lfd/contracts';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/**
 * Le **contrôle de panier** : ce que la plateforme dirait de ce panier s'il
 * partait maintenant.
 *
 * Une lecture, rien d'autre — aucune commande n'est créée, aucune alerte n'est
 * inscrite. Le client peut ajuster ses quantités autant qu'il veut, ça ne laisse
 * aucune trace.
 *
 * Le service ne décide **rien** : ce qui mérite d'être dit, et dans quels mots,
 * est tranché côté serveur. Rejouer ici la moindre règle — un seuil, un « seuls
 * les écarts à la hausse » — reviendrait à avoir deux vérités, dont une seule
 * s'appliquerait vraiment à la commande.
 */
@Injectable({ providedIn: 'root' })
export class OrderPreflightService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  check(payload: OrderPreflightPayload): Promise<OrderPreflightView> {
    return firstValueFrom(
      this.auth
        .accessToken$()
        .pipe(
          switchMap((token) =>
            this.http.post<OrderPreflightView>(
              `${AUTH_CONFIG.apiBaseUrl}/orders/preflight`,
              payload,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          ),
        ),
    );
  }
}
