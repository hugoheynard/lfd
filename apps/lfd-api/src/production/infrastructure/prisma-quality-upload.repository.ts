import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { QualityUpload } from "../domain/entities/quality-upload.js";
import { QualityUploadRepository } from "../domain/ports/quality-upload.repository.js";

const UPLOAD_SELECT = {
  id: true,
  storageKey: true,
  contentType: true,
  byteSize: true,
  uploadedBy: true,
  uploadedAt: true,
  releasedAt: true,
  photo: { select: { checkId: true } },
} as const;

interface UploadRow {
  readonly id: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly releasedAt: Date | null;
  readonly photo: { readonly checkId: string } | null;
}

/**
 * Les dépôts de photos de contrôle, dans le schéma `production` (D8).
 *
 * Le rattachement se LIT par la relation inverse (`production_quality_photo`
 * porte l'`upload_id`, unique) : aucune colonne du dépôt ne le répète, donc
 * rien ne peut dire « rattaché » d'un côté et « libre » de l'autre.
 */
@Injectable()
export class PrismaQualityUploadRepository extends QualityUploadRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(upload: QualityUpload): Promise<void> {
    await this.prisma.productionQualityUpload.create({
      data: {
        id: upload.id,
        storageKey: upload.storageKey,
        contentType: upload.contentType,
        byteSize: upload.byteSize,
        uploadedBy: upload.uploadedBy,
        uploadedAt: upload.uploadedAt,
      },
    });
  }

  async loadMany(ids: readonly string[]): Promise<readonly QualityUpload[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.productionQualityUpload.findMany({
      where: { id: { in: [...ids] } },
      select: UPLOAD_SELECT,
    });
    return rows.map(toDomain);
  }

  async releasable(uploadedBefore: Date, limit: number): Promise<readonly QualityUpload[]> {
    const rows = await this.prisma.productionQualityUpload.findMany({
      where: { releasedAt: null, uploadedAt: { lt: uploadedBefore } },
      orderBy: { uploadedAt: "asc" },
      take: limit,
      select: UPLOAD_SELECT,
    });
    return rows.map(toDomain);
  }

  /** Conditionnée sur `released_at IS NULL` : la première libération garde son instant. */
  async markReleased(ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.productionQualityUpload.updateMany({
      where: { id: { in: [...ids] }, releasedAt: null },
      data: { releasedAt: at },
    });
  }
}

function toDomain(row: UploadRow): QualityUpload {
  return QualityUpload.restore({
    id: row.id,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    attachedTo: row.photo?.checkId ?? null,
    releasedAt: row.releasedAt,
  });
}
