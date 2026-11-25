import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type {
  AdminBackorderConvertPayload,
  AdminBackorderQuotePayload,
  AdminBackorderView,
  AdminOrderEstimateView,
  AdminPlacedOrderResponse,
  BackorderState,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

const BASE = `${B2B_API_BASE}/admin/backorders`;

/**
 * **Les reliquats de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4 et § 5) :
 * la liste, l'abandon, et la transformation en commande. Transformer passe par
 * `/quote` puis `/convert`, jamais par `POST /admin/orders` : une passation
 * ordinaire ne fermerait pas le reliquat, et ne garderait pas le prix
 * d'origine.
 */
@Injectable({ providedIn: 'root' })
export class AdminBackordersService {
  private readonly http = inject(HttpClient);

  /** Du plus ancien au plus récent ; `open` par défaut côté serveur. */
  async list(state: BackorderState = 'open', companyId?: string): Promise<AdminBackorderView[]> {
    let params = new HttpParams().set('state', state);
    if (companyId !== undefined) {
      params = params.set('companyId', companyId);
    }
    return firstValueFrom(this.http.get<AdminBackorderView[]>(BASE, { params }));
  }

  /** `204` ; `409 orders.backorder.closed` s'il est déjà transformé ou abandonné. */
  async abandon(id: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${BASE}/${encodeURIComponent(id)}/abandon`, {}));
  }

  /**
   * L'estimation de la commande issue du reliquat. Un `Observable`, comme
   * l'estimation de la saisie : la requête en vol s'annule au changement.
   */
  quote(id: string, payload: AdminBackorderQuotePayload): Observable<AdminOrderEstimateView> {
    return this.http.post<AdminOrderEstimateView>(
      `${BASE}/${encodeURIComponent(id)}/quote`,
      payload,
    );
  }

  /**
   * Une fois par intention : la clé vient d'une `GestureIntents` et se renvoie
   * à chaque clic jusqu'au succès — un double clic rend la même commande.
   */
  async convert(
    id: string,
    payload: AdminBackorderConvertPayload,
    intentKey: string,
  ): Promise<AdminPlacedOrderResponse> {
    return firstValueFrom(
      this.http.post<AdminPlacedOrderResponse>(
        `${BASE}/${encodeURIComponent(id)}/convert`,
        payload,
        intentOptions(intentKey),
      ),
    );
  }
}
