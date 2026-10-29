import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { SaleReferenceDecisionView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les décisions tarifaires debout sur une référence de vente**
 * (`plan-pro-voit-les-declinaisons.md`, L7) — lecture seule.
 */
@Injectable({ providedIn: 'root' })
export class SaleReferenceDecisionsService {
  private readonly http = inject(HttpClient);

  standingOn(sku: string): Promise<readonly SaleReferenceDecisionView[]> {
    return firstValueFrom(
      this.http.get<readonly SaleReferenceDecisionView[]>(
        `${B2B_API_BASE}/admin/pricing/sale-references/${encodeURIComponent(sku)}/decisions`,
      ),
    );
  }
}
