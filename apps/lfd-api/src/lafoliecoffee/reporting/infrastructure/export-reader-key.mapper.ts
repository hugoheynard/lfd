import { ExportReaderKey } from "../domain/entities/export-reader-key.js";

/** La ligne `export_reader_key`, telle que Prisma la rend. */
export interface ExportReaderKeyRow {
  readonly id: string;
  readonly label: string;
  readonly secretHash: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedByStaffId: string | null;
  readonly allowedIps: readonly string[];
}

/** Ligne → clé : la clé revalide son haché, sa révocation et ses adresses. */
export function exportReaderKeyToDomain(row: ExportReaderKeyRow): ExportReaderKey {
  return ExportReaderKey.rehydrate(row);
}
