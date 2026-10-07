import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AddressDoorstepRulePayload,
  AddressDoorstepRuleView,
  DoorstepRule,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La décision réglée d'avance à la porte d'une adresse**
 * (`documentation/livraisons/livreur/a-la-porte.md`, B3 bis) — la route du
 * commercial, sous `delivery_procedures`, comme « dépôt autorisé ». `null` :
 * l'adresse hérite du réglage global.
 */
@Injectable({ providedIn: 'root' })
export class AdminDeliveryDoorstepRuleService {
  private readonly http = inject(HttpClient);

  read(companyId: string, addressId: string): Promise<AddressDoorstepRuleView> {
    return firstValueFrom(this.http.get<AddressDoorstepRuleView>(this.url(companyId, addressId)));
  }

  async set(companyId: string, addressId: string, rule: DoorstepRule | null): Promise<void> {
    const payload: AddressDoorstepRulePayload = { rule };
    await firstValueFrom(this.http.put(this.url(companyId, addressId), payload));
  }

  private url(companyId: string, addressId: string): string {
    return `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/delivery-addresses/${encodeURIComponent(addressId)}/doorstep-rule`;
  }
}
