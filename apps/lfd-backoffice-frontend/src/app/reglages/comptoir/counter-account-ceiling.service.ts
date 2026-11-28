import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CounterAccountCeilingPayload, CounterAccountCeilingView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **Le plafond des comptes ouverts au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3.3), sous `lfc_order_settings`. Poser le même montant pose le même état :
 * aucune clé d'intention.
 */
@Injectable({ providedIn: 'root' })
export class CounterAccountCeilingService {
  private readonly http = inject(HttpClient);

  read(): Promise<CounterAccountCeilingView> {
    return firstValueFrom(this.http.get<CounterAccountCeilingView>(this.url()));
  }

  /** `204` sans corps : l'appelant relit. */
  set(payload: CounterAccountCeilingPayload): Promise<void> {
    return firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/counter-account-ceiling`;
  }
}
