import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { MediaCarrierView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/** **Les porteurs d'une image** — `/media/carriers`. */
@Injectable({ providedIn: 'root' })
export class MediaCarriersApi {
  private readonly http = inject(HttpClient);

  /**
   * **Qui affiche cette image** — nommés, pas comptés.
   *
   * 🔴 Distinct du `uses` que porte chaque entrée de la liste : celui-là est
   * un compte, obtenu en balayant des pages entières sans charger aucun
   * libellé. Les deux peuvent diverger le temps qu'une fiche change — d'où la
   * règle d'écran : on n'affiche pas les deux nombres côte à côte.
   */
  async carriersOf(url: string): Promise<readonly MediaCarrierView[]> {
    return firstValueFrom(
      this.http.get<readonly MediaCarrierView[]>(`${B2B_API_BASE}/media/carriers`, {
        params: { url },
      }),
    );
  }
}
