import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CompanyStatusPayload, CustomerSheetView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../../api/api-config';

/**
 * Transport de la **fiche client commerciale** : sa lecture, et les gestes qui
 * changent l'état du compte.
 */
@Injectable({ providedIn: 'root' })
export class CustomerSheetService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/companies`;

  sheet(companyId: string): Promise<CustomerSheetView> {
    return this.request<CustomerSheetView>('GET', `${this.base}/${companyId}/customer-sheet`);
  }

  changeStatus(companyId: string, payload: CompanyStatusPayload): Promise<void> {
    return this.request<void>('PATCH', `${this.base}/${companyId}/status`, payload);
  }

  private request<T>(method: string, url: string, body?: unknown): Promise<T> {
    return firstValueFrom(this.http.request<T>(method, url, { body }));
  }
}
