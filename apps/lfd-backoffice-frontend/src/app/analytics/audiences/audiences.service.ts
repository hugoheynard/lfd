import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AudienceDimension, AudiencePeriod, AudiencesView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les audiences de la clientèle** — `GET /admin/audiences`, sous
 * `b2b_growth:read` (`documentation/recommandation-produit/plan-audiences.md`,
 * A1). Transport pur : le seuil d'anonymat est appliqué par le serveur, une
 * case masquée n'arrive jamais avec ses chiffres.
 */
@Injectable({ providedIn: 'root' })
export class AudiencesService {
  private readonly http = inject(HttpClient);

  /** Toutes les coupes sur `days` jours métier, ou la seule `dimension` nommée. */
  read(days: AudiencePeriod, dimension?: AudienceDimension): Promise<AudiencesView> {
    const params: Record<string, string> = { days: String(days) };
    if (dimension !== undefined) {
      params['dimension'] = dimension;
    }
    return firstValueFrom(
      this.http.get<AudiencesView>(`${B2B_API_BASE}/admin/audiences`, { params }),
    );
  }
}
