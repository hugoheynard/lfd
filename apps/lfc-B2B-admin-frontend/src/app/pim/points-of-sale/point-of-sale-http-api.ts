import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { PointOfSaleKindView, PointOfSaleView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { CreatedIdResponse, IssuedTokenResponse } from '@lfd/contracts';

/** Ce qu'on RÈGLE sur un point de vente. Le genre n'y est pas : il est figé. */
export interface PointOfSaleInput {
  readonly label: string;
  readonly baseUrl: string;
  /** Les contextes qu'elle OFFRE. C'était deux drapeaux ; c'est une liste. */
  readonly contexts: readonly string[];
  readonly tableCount: number;
}

/**
 * Ce qu'on envoie pour en OUVRIR un : le réglage, plus le genre.
 *
 * Le genre n'est que dans cette charge — il décide de la forme (adresse,
 * tables) et ne se change plus ensuite.
 */
export interface OpenPointOfSaleInput extends PointOfSaleInput {
  readonly kind: PointOfSaleKindView;
}

/**
 * Accès **réel** aux points de vente — parle au backend (`points-of-sale`).
 *
 * Le token QR d'une table est **minté par le serveur** (R1) : `generateTableQr`
 * ne l'envoie plus, il le reçoit.
 */
@Injectable({ providedIn: 'root' })
export class PointOfSaleHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Promise<PointOfSaleView[]> {
    return firstValueFrom(this.http.get<PointOfSaleView[]>(this.url('')));
  }

  openPointOfSale(input: OpenPointOfSaleInput): Promise<CreatedIdResponse> {
    return firstValueFrom(this.http.post<CreatedIdResponse>(this.url(''), input));
  }

  async update(id: string, patch: Partial<PointOfSaleInput>): Promise<void> {
    await firstValueFrom(this.http.put(this.url(id), patch));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
  }

  /** (Re)génère le QR : le backend mint le token neuf et le renvoie. */
  generateTableQr(id: string, tableNumber: number): Promise<IssuedTokenResponse> {
    return firstValueFrom(
      this.http.post<IssuedTokenResponse>(this.url(`${id}/tables/${tableNumber}/qr`), {}),
    );
  }

  async removeTableQr(id: string, tableNumber: number): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`${id}/tables/${tableNumber}/qr`)));
  }

  private url(path: string): string {
    return path === '' ? `${this.base}/points-of-sale` : `${this.base}/points-of-sale/${path}`;
  }
}
