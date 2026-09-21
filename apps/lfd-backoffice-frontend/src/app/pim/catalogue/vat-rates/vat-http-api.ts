import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { VatRateView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../data/api';
import type { VatRate } from '../../data/models';
import type { CreatedIdResponse } from '@lfd/contracts';

export interface VatRateInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

/**
 * Accès **réel** aux taux de TVA — parle au backend (`vat-rates`).
 * Le `tag` (handle Shopify) est dérivé du taux côté serveur ; le front ne l'envoie
 * jamais. Remplace la branche LocalDb.
 */
@Injectable({ providedIn: 'root' })
export class VatRateHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<VatRate[]> {
    const rows = await firstValueFrom(this.http.get<VatRateView[]>(this.url('')));
    return rows.map((row) => ({ ...row }));
  }

  create(input: VatRateInput): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.url(''), this.body(input)));
  }

  async update(id: string, input: VatRateInput): Promise<void> {
    await firstValueFrom(this.http.put(this.url(id), this.body(input)));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
  }

  private body(input: VatRateInput): Record<string, unknown> {
    return {
      name: input.name,
      percent: input.percent,
      ...(input.description === undefined ? {} : { description: input.description }),
    };
  }

  private url(path: string): string {
    return path === '' ? `${this.base}/vat-rates` : `${this.base}/vat-rates/${path}`;
  }
}
