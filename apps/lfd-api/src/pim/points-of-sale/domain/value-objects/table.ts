/**
 * État d'une **table** d'emplacement. `number` est l'identité (verrouillée) ;
 * `token` n'existe que lorsqu'un QR a été généré.
 */
export interface TableState {
  readonly number: number;
  readonly qrCreated: boolean;
  readonly token: string | null;
}

/** Borne dure du nombre de tables d'un emplacement. */
export const MAX_TABLES = 200;

/**
 * Aligne la grille de tables sur `count` (numéros `1..count`), en **préservant**
 * l'état QR des tables conservées. Réduire `count` supprime les tables de numéro
 * supérieur (et leur token) ; l'augmenter ajoute des tables sans QR. Pure.
 */
export function syncTables(current: readonly TableState[], count: number): TableState[] {
  const clamped = Math.max(0, Math.min(MAX_TABLES, Math.floor(count)));
  const tables: TableState[] = [];
  for (let n = 1; n <= clamped; n += 1) {
    const existing = current.find((table) => table.number === n);
    tables.push(existing ?? { number: n, qrCreated: false, token: null });
  }
  return tables;
}
