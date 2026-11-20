import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ShopTillOrdersReportView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les commandes notées au comptoir, à régler en boutique** —
 * `GET /admin/growth/shop-till-orders`, sous `b2b_growth:read`
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 4.2). Transport pur :
 * les sommes sont faites par le serveur.
 */
@Injectable({ providedIn: 'root' })
export class ShopTillOrdersService {
  private readonly http = inject(HttpClient);

  report(from: string, to: string): Promise<ShopTillOrdersReportView> {
    return firstValueFrom(
      this.http.get<ShopTillOrdersReportView>(`${B2B_API_BASE}/admin/growth/shop-till-orders`, {
        params: { from, to },
      }),
    );
  }
}
