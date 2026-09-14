import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CustomerBankAccountSectionView, SetCompanyBankAccountPayload } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/**
 * **Le RIB de la société**, tel que le client le voit et le dépose sur
 * `/mon-compte` (plan `documentation/b2b/plan-rib-client.md`, lot B).
 *
 * Deux gestes, et pas un de plus : lire, écrire. Le service ne garde aucun
 * état — une seule carte lit ce RIB, et c'est elle qui décide quoi montrer
 * pendant la lecture ou après un échec.
 *
 * 🔴 L'IBAN **monte en clair et ne redescend jamais** : la lecture n'en rend
 * que `last4`. Le mur (rôle `owner` ou `billing`, 404 hors société) est tenu
 * par l'API ; l'écran ne fait que ne pas proposer la carte aux autres rôles.
 */
@Injectable({ providedIn: 'root' })
export class ClientBankAccount {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /** `GET /companies/:companyId/bank-account` — `{ account: null }` sans RIB déposé. */
  async read(companyId: string): Promise<CustomerBankAccountSectionView> {
    return firstValueFrom(
      this.http.get<CustomerBankAccountSectionView>(this.url(companyId), {
        headers: await this.headers(),
      }),
    );
  }

  /** `PUT` du compte entier (204) : l'appelant relit ensuite, la réponse ne porte rien. */
  async save(companyId: string, payload: SetCompanyBankAccountPayload): Promise<void> {
    await firstValueFrom(
      this.http.put(this.url(companyId), payload, { headers: await this.headers() }),
    );
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/bank-account`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
