import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PickupAddressView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Points de retrait vus de l'**équipe** — le comptoir, la saisie de commande
 * et la fiche client (`GET /admin/pickup-addresses`).
 *
 * La route publique ne sert plus que les points des particuliers (Hugo,
 * 2026-10-15 : la liste est filtrée au serveur) ; l'équipe lit la sienne,
 * ouverte à qui tient un de ces écrans. L'écriture est celle des sites,
 * réglés par `SitesService` sous `lfc_site_settings`.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly http = inject(HttpClient);

  /** Tous les points proposés, par ancienneté — le comptoir voit tous les sites. */
  list(): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/admin/pickup-addresses`),
    );
  }

  /**
   * Les points que CE client peut choisir — ceux de sa clientèle, comme la
   * boutique les lui propose et comme la caisse les accepte.
   */
  listFor(companyId: string): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/admin/pickup-addresses`, {
        params: new HttpParams().set('companyId', companyId),
      }),
    );
  }
}
