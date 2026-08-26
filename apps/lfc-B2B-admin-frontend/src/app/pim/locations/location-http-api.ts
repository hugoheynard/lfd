import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { LocationView, TableView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Location, LocationTable } from '../data/models';

function toTable(table: TableView): LocationTable {
  return table.token === null
    ? { number: table.number, qrCreated: table.qrCreated }
    : { number: table.number, qrCreated: table.qrCreated, token: table.token };
}

function toLocation(row: LocationView): Location {
  return {
    id: row.id,
    name: row.name,
    clickCollect: row.clickCollect,
    eatIn: row.eatIn,
    baseUrl: row.baseUrl,
    tables: row.tables.map(toTable),
    usedByCategories: row.usedByCategories,
  };
}

export interface LocationInput {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly eatIn: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

/**
 * Accès **réel** aux emplacements — parle au backend (`locations`).
 * Le token QR d'une table est **minté par le serveur** (R1) : `generateTableQr`
 * ne l'envoie plus, il le reçoit. Remplace la branche LocalDb.
 */
@Injectable({ providedIn: 'root' })
export class LocationHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<Location[]> {
    const rows = await firstValueFrom(this.http.get<LocationView[]>(this.url('')));
    return rows.map(toLocation);
  }

  create(input: LocationInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(this.url(''), input));
  }

  async update(id: string, patch: Partial<LocationInput>): Promise<void> {
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
    return path === '' ? `${this.base}/locations` : `${this.base}/locations/${path}`;
  }
}
