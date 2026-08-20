import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { TvaRegimeView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../data/api';
import type { TvaRegime } from '../../data/models';

export interface TvaRegimeInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly percent: number;
}

/**
 * Accès **réel** aux régimes de TVA — parle au backend (`commerce/tva-regimes`).
 * Le `tag` (handle Shopify) est dérivé du taux côté serveur ; le front ne l'envoie
 * jamais. Remplace la branche LocalDb.
 */
@Injectable({ providedIn: 'root' })
export class TvaHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<TvaRegime[]> {
    const rows = await firstValueFrom(this.http.get<TvaRegimeView[]>(this.url('')));
    return rows.map((row) => ({ ...row }));
  }

  create(input: TvaRegimeInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(this.url(''), this.body(input)));
  }

  async update(id: string, input: TvaRegimeInput): Promise<void> {
    await firstValueFrom(this.http.put(this.url(id), this.body(input)));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
  }

  private body(input: TvaRegimeInput): Record<string, unknown> {
    return {
      name: input.name,
      percent: input.percent,
      ...(input.description === undefined ? {} : { description: input.description }),
    };
  }

  private url(path: string): string {
    return path === ''
      ? `${this.base}/commerce/tva-regimes`
      : `${this.base}/commerce/tva-regimes/${path}`;
  }
}
