import type { QualityCheck, QualityPhotoRef } from "../../domain/entities/quality-check.js";
import { QualityUpload, type QualityUploadState } from "../../domain/entities/quality-upload.js";
import { QualityCheckWriteRaceError } from "../../domain/errors/quality-record-errors.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "../../domain/ports/quality-check.repository.js";
import { QualityUploadRepository } from "../../domain/ports/quality-upload.repository.js";
import type { QualityLineStatusReader } from "../../domain/ports/quality-line-status.reader.js";
import type { ServiceDay } from "../../../day/index.js";
import { CheckedQualityLinesReader } from "../services/checked-quality-lines.reader.js";

/**
 * Les doublés du contrôle qualité — chacun ÉTEND son port, donc aucun cast.
 * Une « base » en mémoire partagée par les ports qui la lisent, comme la vraie.
 */

/** La table des contrôles — l'unicité de l'`id` et des dépôts, comme en base. */
export class CheckTable {
  readonly rows = new Map<string, QualityCheck>();

  attachedTo(uploadId: string): string | null {
    for (const check of this.rows.values()) {
      if (check.photos.some((photo) => photo.uploadId === uploadId)) {
        return check.id;
      }
    }
    return null;
  }
}

export class InMemoryChecks extends QualityCheckRepository {
  /** Simule un enregistrement concurrent gagnant, posé juste avant l'écriture. */
  raceWinner: QualityCheck | null = null;

  constructor(readonly table: CheckTable) {
    super();
  }

  load(id: string): Promise<QualityCheck | null> {
    return Promise.resolve(this.table.rows.get(id) ?? null);
  }

  save(check: QualityCheck): Promise<void> {
    if (this.raceWinner !== null) {
      this.table.rows.set(this.raceWinner.id, this.raceWinner);
      this.raceWinner = null;
    }
    const taken = check.photos.some((photo) => this.table.attachedTo(photo.uploadId) !== null);
    if (this.table.rows.has(check.id) || taken) {
      return Promise.reject(new QualityCheckWriteRaceError());
    }
    this.table.rows.set(check.id, check);
    return Promise.resolve();
  }
}

export class InMemoryCheckReader extends QualityCheckReader {
  constructor(private readonly table: CheckTable) {
    super();
  }

  forDay(day: ServiceDay): Promise<readonly QualityCheck[]> {
    return Promise.resolve([...this.table.rows.values()].filter((c) => c.serviceDay.equals(day)));
  }

  photo(checkId: string, position: number): Promise<QualityPhotoRef | null> {
    const check = this.table.rows.get(checkId);
    return Promise.resolve(check?.photos.find((p) => p.position === position) ?? null);
  }
}

/**
 * Le port que la qualité publie pour la fiche d'atelier, sur une table de
 * contrôles : la VRAIE règle de verdict (`CheckedQualityLinesReader`), pas une
 * réponse figée — la fiche doit marquer ses lignes comme la Supervision.
 */
export function qualityLinesFrom(checks: CheckTable): QualityLineStatusReader {
  return new CheckedQualityLinesReader(new InMemoryCheckReader(checks));
}

export class InMemoryUploads extends QualityUploadRepository {
  readonly rows = new Map<string, QualityUploadState>();

  constructor(private readonly checks: CheckTable) {
    super();
  }

  record(upload: QualityUpload): Promise<void> {
    this.rows.set(upload.id, {
      id: upload.id,
      storageKey: upload.storageKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      uploadedBy: upload.uploadedBy,
      uploadedAt: upload.uploadedAt,
      attachedTo: null,
      releasedAt: null,
    });
    return Promise.resolve();
  }

  loadMany(ids: readonly string[]): Promise<readonly QualityUpload[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row === undefined ? [] : [this.restore(row)];
      }),
    );
  }

  releasable(uploadedBefore: Date, limit: number): Promise<readonly QualityUpload[]> {
    const rows = [...this.rows.values()]
      .filter((row) => row.releasedAt === null && row.uploadedAt < uploadedBefore)
      .sort((left, right) => left.uploadedAt.getTime() - right.uploadedAt.getTime())
      .slice(0, limit);
    return Promise.resolve(rows.map((row) => this.restore(row)));
  }

  markReleased(ids: readonly string[], at: Date): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row !== undefined && row.releasedAt === null) {
        this.rows.set(id, { ...row, releasedAt: at });
      }
    }
    return Promise.resolve();
  }

  private restore(row: QualityUploadState): QualityUpload {
    return QualityUpload.restore({ ...row, attachedTo: this.checks.attachedTo(row.id) });
  }
}

/** Un JPEG minimal : ses trois octets de tête suffisent au domaine. */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
