import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApplyPriceTemplatePayload,
  PriceTemplateKind,
  PriceTemplateView,
  SavePriceTemplatePayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les gabarits tarifaires** — mercuriales et devis, un seul service.
 *
 * Les deux portent exactement la même chose : une grille de prix. Un second
 * service par nature aurait dupliqué quatre appels pour un discriminant.
 */
@Injectable({ providedIn: 'root' })
export class PriceTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/templates`;

  async list(kind: PriceTemplateKind): Promise<readonly PriceTemplateView[]> {
    return firstValueFrom(
      this.http.get<readonly PriceTemplateView[]>(this.base, { params: { kind } }),
    );
  }

  async compose(payload: SavePriceTemplatePayload): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(this.base, payload));
  }

  /** Une grille se remplace **entière** : `PUT`, jamais un palier à la fois. */
  async revise(id: string, payload: SavePriceTemplatePayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${encodeURIComponent(id)}`, payload));
  }

  /** Rend le nombre de règles posées — une ligne à deux paliers en pose deux. */
  async apply(id: string, payload: ApplyPriceTemplatePayload): Promise<{ posedRules: number }> {
    return firstValueFrom(
      this.http.post<{ posedRules: number }>(
        `${this.base}/${encodeURIComponent(id)}/apply`,
        payload,
      ),
    );
  }
}
