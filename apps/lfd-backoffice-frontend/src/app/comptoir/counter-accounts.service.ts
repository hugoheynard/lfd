import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CreatedIdResponse, OpenCounterAccountPayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';
import { intentOptions } from '../shared/gesture-intents';

/**
 * **Les comptes pro ouverts au comptoir** (`plan-comptes-du-comptoir.md`,
 * § 3) — transport pur, sous `b2b_counter_accounts:write`.
 */
@Injectable({ providedIn: 'root' })
export class CounterAccountsService {
  private readonly http = inject(HttpClient);

  /** Ouvre le compte, une fois par intention ; rend l'id de la société. Un refus remonte tel quel. */
  async open(payload: OpenCounterAccountPayload, intentKey: string): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(
        `${B2B_API_BASE}/admin/counter/accounts`,
        payload,
        intentOptions(intentKey),
      ),
    );
    return created.id;
  }
}
