import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderPackingView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Le **colisage**, côté staff. Deux appels : lire ce qu'une fiche désigne, puis
 * déclarer la commande prête.
 *
 * Jumeau de `HandoverService`, à une différence près qui n'est pas cosmétique :
 * la clé de lecture est le **numéro de commande**, pas un secret. Le colisage
 * est un fait interne — personne d'autre à représenter, donc rien à
 * s'attribuer indûment. Ce qui le protège est la porte staff.
 */
@Injectable({ providedIn: 'root' })
export class PackingService {
  private readonly http = inject(HttpClient);

  /** Ce qu'il y a derrière ce numéro — avant de déclarer quoi que ce soit. */
  async byReference(reference: string): Promise<OrderPackingView> {
    return firstValueFrom(
      this.http.get<OrderPackingView>(
        `${B2B_API_BASE}/admin/production/packing/${encodeURIComponent(reference)}`,
      ),
    );
  }

  /** Déclare la commande prête ; rend le fait obtenu (qui, quand). */
  async markReady(reference: string): Promise<OrderPackingView> {
    return firstValueFrom(
      this.http.post<OrderPackingView>(
        `${B2B_API_BASE}/admin/production/packing/${encodeURIComponent(reference)}/ready`,
        {},
      ),
    );
  }
}
