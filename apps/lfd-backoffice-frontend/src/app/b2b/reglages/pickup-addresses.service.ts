import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { PickupAddressView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Points de retrait — la **lecture publique** que le comptoir, la saisie de
 * commande, les heures limites et la fiche client partagent avec le checkout.
 *
 * L'écriture en est partie le 2026-10-13 : les points sont devenus les sites,
 * réglés par `SitesService` sous `lfc_site_settings` (plan des sites, S1).
 * Cette lecture-ci ne passe pas par ce droit, et c'est voulu.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressesService {
  private readonly http = inject(HttpClient);

  /** Liste les points de retrait (le défaut en tête). Route publique. */
  list(): Promise<readonly PickupAddressView[]> {
    return firstValueFrom(
      this.http.get<readonly PickupAddressView[]>(`${B2B_API_BASE}/pickup-addresses`),
    );
  }
}
