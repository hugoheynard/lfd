import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { SalesOversightView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import type { SalesOversightFilters } from './sales-oversight-filters';

/** La lecture du suivi commercial (`GET /admin/sales-oversight`, droit `b2b_sales_oversight`). */
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
}
