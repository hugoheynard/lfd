import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { UnconfirmedDeliveriesView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les bons à constater** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, lot ZL) : les
 * bons au compte dont le jour est passé sans remise attestée. Lecture seule,
 * sous `b2b_accounting:read`.
 */
@Injectable({ providedIn: 'root' })
export class UnconfirmedDeliveriesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/unconfirmed-deliveries`;

  async list(): Promise<UnconfirmedDeliveriesView> {
    return firstValueFrom(this.http.get<UnconfirmedDeliveriesView>(this.base));
  }
}
