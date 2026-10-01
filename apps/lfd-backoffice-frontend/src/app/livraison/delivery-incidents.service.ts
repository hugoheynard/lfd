import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { UndeliveredStopsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const DELIVERY = `${B2B_API_BASE}/admin/livraison`;

/**
 * **Les signalements et « Non remis », côté admin**
 * (`documentation/livraisons/plan-a-la-porte.md`, § 3, AP-D7), sous
 * `delivery_rounds:read`. Les signalements du jour arrivent avec la
 * composition des tournées ; ici, la vue « Non remis » et les photos.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryIncidentsService {
  private readonly http = inject(HttpClient);

  undelivered(): Promise<UndeliveredStopsView> {
    return firstValueFrom(this.http.get<UndeliveredStopsView>(`${DELIVERY}/non-remis`));
  }

  /** La photo d'un signalement, en blob : un `<img src>` nu n'enverrait pas le jeton. */
  photo(incidentId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${DELIVERY}/incidents/${encodeURIComponent(incidentId)}/photo`, {
        responseType: 'blob',
      }),
    );
  }
}
