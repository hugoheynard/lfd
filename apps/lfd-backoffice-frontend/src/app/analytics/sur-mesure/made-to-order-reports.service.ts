import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  MadeToOrderByClientView,
  MadeToOrderMonthWindow,
  MadeToOrderMonthlyView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/growth/made-to-order`;

/**
 * **Les rapports du sur mesure** — `GET /admin/growth/made-to-order/*`, sous
 * `b2b_growth:read` (`documentation/catalogue/plan-sur-mesure-partout.md`,
 * § 5 ter). Transport pur : les sommes et la part sont faites par le serveur.
 */
@Injectable({ providedIn: 'root' })
export class MadeToOrderReportsService {
  private readonly http = inject(HttpClient);

  monthly(months: MadeToOrderMonthWindow): Promise<MadeToOrderMonthlyView> {
    return firstValueFrom(
      this.http.get<MadeToOrderMonthlyView>(`${BASE}/monthly`, {
        params: { months: String(months) },
      }),
    );
  }

  byClient(from: string, to: string): Promise<MadeToOrderByClientView> {
    return firstValueFrom(
      this.http.get<MadeToOrderByClientView>(`${BASE}/clients`, { params: { from, to } }),
    );
  }
}
