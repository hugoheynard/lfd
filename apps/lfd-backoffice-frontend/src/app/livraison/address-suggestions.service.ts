import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AddressPointDecisionPayload, AddressPointSuggestionsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const SUGGESTIONS = `${B2B_API_BASE}/admin/livraison/carnet-a-corriger`;

/**
 * **« Carnet à corriger »** (`documentation/livraisons/livreur/gps-y-aller-et-position.md`,
 * §6) — transport pur, sous `delivery_rounds:write`, lecture comprise.
 */
@Injectable({ providedIn: 'root' })
export class AddressSuggestionsService {
  private readonly http = inject(HttpClient);

  list(): Promise<AddressPointSuggestionsView> {
    return firstValueFrom(this.http.get<AddressPointSuggestionsView>(SUGGESTIONS));
  }

  async apply(addressId: string, decision: AddressPointDecisionPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${SUGGESTIONS}/${encodeURIComponent(addressId)}/appliquer`, decision),
    );
  }

  async ignore(addressId: string, decision: AddressPointDecisionPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${SUGGESTIONS}/${encodeURIComponent(addressId)}/ignorer`, decision),
    );
  }
}
