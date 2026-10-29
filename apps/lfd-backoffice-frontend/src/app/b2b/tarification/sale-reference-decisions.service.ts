import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AmendedMercurialeResponse,
  CarryOverMercurialeLinePayload,
  SaleReferenceDecisionView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les décisions tarifaires debout sur une référence de vente**
 * (`plan-pro-voit-les-declinaisons.md`, L7), et le report d'une mercuriale
 * sur la référence née d'un détachement (`plan-tarif-date-sur-une-reference.md`, § 6).
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

  /** Reporte sur `payload.toSku` le prix que `fromSku` porte dans cette mercuriale. */
  carryOver(
    fromSku: string,
    mercurialeId: string,
    payload: CarryOverMercurialeLinePayload,
  ): Promise<AmendedMercurialeResponse> {
    return firstValueFrom(
      this.http.post<AmendedMercurialeResponse>(
        `${B2B_API_BASE}/admin/pricing/sale-references/${encodeURIComponent(fromSku)}/decisions/mercuriales/${encodeURIComponent(mercurialeId)}/carry-over`,
        payload,
      ),
    );
  }
}
