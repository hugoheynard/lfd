import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ResupplyProductionDayView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les réassorts d'une journée, pour le fournil** —
 * `/admin/site-resupplies/to-produce/:day`, en lecture, sous les droits du
 * fournil (fournée ou prévisionnel). Le commerce sert le réassort ; l'onglet
 * « Réassorts » de Prod manager le lit côté navigateur (lot R3d,
 * `reassort-boutiques/plan-reapprovisionnement.md`), figés compris.
 */
@Injectable({ providedIn: 'root' })
export class ResuppliesToProduceService {
  private readonly http = inject(HttpClient);

  day(serviceDay: string): Promise<ResupplyProductionDayView> {
    return firstValueFrom(
      this.http.get<ResupplyProductionDayView>(
        `${B2B_API_BASE}/admin/site-resupplies/to-produce/${encodeURIComponent(serviceDay)}`,
      ),
    );
  }
}
