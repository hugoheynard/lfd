import type { ExportPart } from "../domain/services/bank-export-reference.js";

/** Les colonnes qui nomment un export : son numéro et son rang dans la série. */
export const NAMING_COLUMNS = { reference: true, partRank: true, partCount: true } as const;

/** Le rang, ou `null` pour un export d'avant la numérotation — les deux colonnes vont ensemble (CHECK). */
export function partFromRow(row: {
  readonly partRank: number | null;
  readonly partCount: number | null;
}): ExportPart | null {
  return row.partRank === null || row.partCount === null
    ? null
    : { rank: row.partRank, count: row.partCount };
}

/** Une ligne lue avec {@link NAMING_COLUMNS}, rendue au domaine. */
export function namingFromRow<
  T extends {
    readonly reference: string;
    readonly partRank: number | null;
    readonly partCount: number | null;
  },
>(row: T): Omit<T, "partRank" | "partCount"> & { readonly part: ExportPart | null } {
  const { partRank, partCount, ...rest } = row;
  return { ...rest, part: partFromRow({ partRank, partCount }) };
}

/** L'inverse, pour l'écriture. */
export function partToRow(part: ExportPart | null): {
  readonly partRank: number | null;
  readonly partCount: number | null;
} {
  return { partRank: part?.rank ?? null, partCount: part?.count ?? null };
}
