import type { TableState } from '../value-objects/table.js';

/** Vue d'un emplacement telle que la persistance la rend — hors colonnes système. */
export interface EmplacementRecord {
  readonly id: string;
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tables: readonly TableState[];
}

/** Champs scalaires d'un emplacement — la grille de tables est portée à part. */
export interface EmplacementFields {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
}

export interface NewEmplacement extends EmplacementFields {
  readonly id: string;
  readonly tables: readonly TableState[];
}

/** Port : l'application dépend de cette abstraction, jamais de Prisma. */
export abstract class EmplacementRepository {
  abstract listAll(): Promise<EmplacementRecord[]>;
  abstract findById(id: string): Promise<EmplacementRecord | null>;
  abstract insert(emplacement: NewEmplacement): Promise<void>;
  abstract updateFields(id: string, fields: EmplacementFields): Promise<void>;
  abstract replaceTables(
    id: string,
    tables: readonly TableState[],
  ): Promise<void>;
  abstract setTableQr(
    id: string,
    tableNumber: number,
    qrCreated: boolean,
    token: string | null,
  ): Promise<void>;
  abstract remove(id: string): Promise<void>;
}
