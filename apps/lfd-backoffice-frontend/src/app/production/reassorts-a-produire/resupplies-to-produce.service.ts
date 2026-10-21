import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ResuppliesToProduceView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Réassorts à produire** — `/admin/site-resupplies/to-produce`, en lecture,
 * sous les droits du fournil (fournée ou prévisionnel). Le commerce sert le
 * réassort ; l'écran le lit côté navigateur, et aucun bloc serveur ne
 * traverse (lot R1, `reassort-boutiques/plan-reapprovisionnement.md` §12).
 */
@Injectable({ providedIn: 'root' })
export class ResuppliesToProduceService {
  private readonly http = inject(HttpClient);

  read(): Promise<ResuppliesToProduceView> {
    return firstValueFrom(
      this.http.get<ResuppliesToProduceView>(`${B2B_API_BASE}/admin/site-resupplies/to-produce`),
    );
  }
}
