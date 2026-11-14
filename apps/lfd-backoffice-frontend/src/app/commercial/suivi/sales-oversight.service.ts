import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AssignCompanyFollowerPayload, SalesOversightView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';
import type { SalesOversightFilters } from './sales-oversight-filters';

/**
 * Le suivi commercial : sa lecture (`GET /admin/sales-oversight`, droit
 * `b2b_sales_oversight`), et le geste qui confie une fiche (en écriture).
 */
@Injectable({ providedIn: 'root' })
export class SalesOversightService {
  private readonly http = inject(HttpClient);

  read(filters: SalesOversightFilters): Promise<SalesOversightView> {
    let params = new HttpParams().set('page', filters.page);
    if (filters.follower !== null) params = params.set('follower', filters.follower);
    if (filters.level !== null) params = params.set('level', filters.level);
    if (filters.signal !== null) params = params.set('signal', filters.signal);
    if (filters.channel !== null) params = params.set('channel', filters.channel);
    return firstValueFrom(
      this.http.get<SalesOversightView>(`${B2B_API_BASE}/admin/sales-oversight`, { params }),
    );
  }

  /** Confie la fiche à `followerStaffId`, ou retire son suiveur (`null`), sous la clé de l'écran. */
  async assignFollower(
    companyId: string,
    followerStaffId: string | null,
    intentKey: string,
  ): Promise<void> {
    const payload: AssignCompanyFollowerPayload = { followerStaffId };
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/follower`,
        payload,
        intentOptions(intentKey),
      ),
    );
  }
}
