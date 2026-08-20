import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { EmplacementView, TableView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import type { Emplacement, EmplacementTable } from '../data/models';

function toTable(table: TableView): EmplacementTable {
  return table.token === null
    ? { number: table.number, qrCreated: table.qrCreated }
    : { number: table.number, qrCreated: table.qrCreated, token: table.token };
}

function toEmplacement(row: EmplacementView): Emplacement {
  return {
    id: row.id,
    name: row.name,
    clickCollect: row.clickCollect,
    surPlace: row.surPlace,
    baseUrl: row.baseUrl,
    tables: row.tables.map(toTable),
  };
}

export interface EmplacementInput {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

/**
 * Accès **réel** aux emplacements — parle au backend (`locations/emplacements`).
 * Le token QR d'une table est **minté par le serveur** (R1) : `generateTableQr`
 * ne l'envoie plus, il le reçoit. Remplace la branche LocalDb.
 */
@Injectable({ providedIn: 'root' })
export class EmplacementHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  async list(): Promise<Emplacement[]> {
    const rows = await firstValueFrom(this.http.get<EmplacementView[]>(this.url('')));
    return rows.map(toEmplacement);
  }

  create(input: EmplacementInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(this.url(''), input));
  }

  async update(id: string, patch: Partial<EmplacementInput>): Promise<void> {
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
    return path === ''
      ? `${this.base}/locations/emplacements`
      : `${this.base}/locations/emplacements/${path}`;
  }
}
