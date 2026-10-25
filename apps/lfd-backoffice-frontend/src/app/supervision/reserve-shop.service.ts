import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PlacedSiteResupplyResponse, SendReserveToShopPayload } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/** Le droit du geste (lot R1d) : envoyer un réassort au point, accordé à l'écran des rôles. */
export const RESERVE_SHOP_WRITE = 'production_resupply:write';

/**
 * **Envoyer en boutique depuis la réserve** — `POST
 * /admin/reserve-shop-releases/:serviceDay` (plan A1, lot A1.4). Le point le
 * reçoit comme un réassort « Pain rendu, envoyé par la réserve ».
 */
@Injectable({ providedIn: 'root' })
export class ReserveShopService {
  private readonly http = inject(HttpClient);

  send(serviceDay: string, payload: SendReserveToShopPayload): Promise<PlacedSiteResupplyResponse> {
    return firstValueFrom(
      this.http.post<PlacedSiteResupplyResponse>(
        `${B2B_API_BASE}/admin/reserve-shop-releases/${encodeURIComponent(serviceDay)}`,
        payload,
      ),
    );
  }
}
