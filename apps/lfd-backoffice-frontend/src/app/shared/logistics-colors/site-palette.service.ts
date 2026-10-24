import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { SitePaletteView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La palette de la logistique** — `GET admin/sites/palette`, en lecture
 * seule, ouverte au colisage et à la livraison SANS `lfc_site_settings` (plan
 * `commandes/back-office/plan-tri-depart-et-couleurs.md`, L1a).
 */
@Injectable({ providedIn: 'root' })
export class SitePaletteService {
  private readonly http = inject(HttpClient);

  palette(): Promise<SitePaletteView> {
    return firstValueFrom(this.http.get<SitePaletteView>(`${B2B_API_BASE}/admin/sites/palette`));
  }
}
