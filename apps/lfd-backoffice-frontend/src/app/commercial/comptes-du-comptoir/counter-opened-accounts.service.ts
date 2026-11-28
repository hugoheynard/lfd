import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CounterAccountConversionView, CounterOpenedAccountsView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Les comptes ouverts au comptoir** — la page du commerce qui les liste avec
 * leur dû, et leur conversion (`plan-comptes-du-comptoir.md`, § 4), sous
 * `b2b_companies`.
 *
 * La conversion est `@Idempotent` côté serveur (sans corps : la rejouer sur un
 * compte déjà converti est refusée par son statut) : aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class CounterOpenedAccountsService {
  private readonly http = inject(HttpClient);

  list(): Promise<CounterOpenedAccountsView> {
    return firstValueFrom(this.http.get<CounterOpenedAccountsView>(this.url()));
  }

  /** Convertit le compte : `active` si rien ne manque, `pending` sinon. */
  convert(companyId: string): Promise<CounterAccountConversionView> {
    return firstValueFrom(
      this.http.post<CounterAccountConversionView>(
        `${this.url()}/${encodeURIComponent(companyId)}/convert`,
        null,
      ),
    );
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/counter-opened-accounts`;
  }
}
