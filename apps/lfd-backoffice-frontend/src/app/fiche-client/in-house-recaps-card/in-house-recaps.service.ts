import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  InHouseRecapReissuedView,
  InHouseRecapResentView,
  PayerInHouseRecapsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

/**
 * **Les récapitulatifs des BL** d'un restaurant maison
 * (`comptabilite/facturation/restaurants-maison.md`) : la liste
 * du payeur et le PDF, sous `b2b_companies:read` ; « Renvoyer l'e-mail » et
 * « Réémettre », sous `b2b_in_house_payers:write`, chacun avec la clé
 * d'intention de l'écran.
 */
@Injectable({ providedIn: 'root' })
export class InHouseRecapsService {
  private readonly http = inject(HttpClient);

  /** `GET admin/companies/:id/in-house-recaps` — récapitulatifs, mois vides, mois manqués. */
  ofCompany(companyId: string): Promise<PayerInHouseRecapsView> {
    return firstValueFrom(
      this.http.get<PayerInHouseRecapsView>(
        `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/in-house-recaps`,
      ),
    );
  }

  /** `GET admin/in-house-recaps/:id/document` — 404 nommé tant que le PDF n'est pas rangé. */
  document(recapId: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.url(recapId)}/document`, { responseType: 'blob' }));
  }

  /** `POST admin/in-house-recaps/:id/resend` — le PDF rendu s'il manquait, puis l'e-mail. */
  resend(recapId: string, intentKey: string): Promise<InHouseRecapResentView> {
    return firstValueFrom(
      this.http.post<InHouseRecapResentView>(
        `${this.url(recapId)}/resend`,
        {},
        intentOptions(intentKey),
      ),
    );
  }

  /** `POST admin/in-house-recaps/:id/reissue` — un rectificatif qui remplace celui-ci. */
  reissue(recapId: string, intentKey: string): Promise<InHouseRecapReissuedView> {
    return firstValueFrom(
      this.http.post<InHouseRecapReissuedView>(
        `${this.url(recapId)}/reissue`,
        {},
        intentOptions(intentKey),
      ),
    );
  }

  private url(recapId: string): string {
    return `${B2B_API_BASE}/admin/in-house-recaps/${encodeURIComponent(recapId)}`;
  }
}
