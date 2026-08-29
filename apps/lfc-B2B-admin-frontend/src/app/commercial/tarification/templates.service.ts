import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApplyPriceTemplatePayload,
  CreatedIdResponse,
  MercurialeBenchmarkView,
  PosedRulesResponse,
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

  /** Un gabarit et sa grille — le tarif catalogue en regard vient du serveur. */
  async byId(id: string): Promise<PriceTemplateView> {
    return firstValueFrom(
      this.http.get<PriceTemplateView>(`${this.base}/${encodeURIComponent(id)}`),
    );
  }

  /**
   * **Ce que le marché paie déjà**, article par article — l'indicateur d'aide.
   *
   * Lu une fois avec la grille et non par article : quatre-vingt-douze appels
   * pour un écran qu'on ouvre pour lire seraient absurdes, et la médiane d'un
   * article se calcule de toute façon sur la même passe que celle des autres.
   */
  async benchmark(): Promise<readonly MercurialeBenchmarkView[]> {
    return firstValueFrom(
      this.http.get<readonly MercurialeBenchmarkView[]>(`${this.base}/benchmark`),
    );
  }

  async compose(payload: SavePriceTemplatePayload): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.base, payload));
  }

  /** Une grille se remplace **entière** : `PUT`, jamais un palier à la fois. */
  async revise(id: string, payload: SavePriceTemplatePayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${encodeURIComponent(id)}`, payload));
  }

  /** Rend le nombre de règles posées — une ligne à deux paliers en pose deux. */
  async apply(id: string, payload: ApplyPriceTemplatePayload): Promise<PosedRulesResponse> {
    return firstValueFrom(
      this.http.post<PosedRulesResponse>(`${this.base}/${encodeURIComponent(id)}/apply`, payload),
    );
  }
}
