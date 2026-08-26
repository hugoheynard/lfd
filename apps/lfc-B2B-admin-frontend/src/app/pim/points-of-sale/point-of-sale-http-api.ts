import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { PointOfSaleView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/** Ce qu'on envoie pour ouvrir une boutique — la plateforme, elle, ne se crée pas. */
export interface ShopInput {
  readonly label: string;
  readonly baseUrl: string;
  /** Les contextes qu'elle OFFRE. C'était deux drapeaux ; c'est une liste. */
  readonly contexts: readonly string[];
  readonly tableCount: number;
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

  openShop(input: ShopInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(this.url(''), input));
  }

  async update(id: string, patch: Partial<ShopInput>): Promise<void> {
    await firstValueFrom(this.http.put(this.url(id), patch));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
  }

  /** (Re)génère le QR : le backend mint le token neuf et le renvoie. */
  generateTableQr(id: string, tableNumber: number): Promise<{ token: string }> {
    return firstValueFrom(
      this.http.post<{ token: string }>(this.url(`${id}/tables/${tableNumber}/qr`), {}),
    );
  }

  async removeTableQr(id: string, tableNumber: number): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`${id}/tables/${tableNumber}/qr`)));
  }

  private url(path: string): string {
    return path === '' ? `${this.base}/points-of-sale` : `${this.base}/points-of-sale/${path}`;
  }
}
