import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  QUALITY_VERDICTS,
  QualityCheck,
  type QualityPhotoRef,
  type QualityVerdict,
} from "../domain/entities/quality-check.js";
import {
  QualityCheckUnreadableError,
  QualityCheckWriteRaceError,
} from "../domain/errors/quality-record-errors.js";
import { QualityCheckReader } from "../domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "../domain/ports/quality-check.repository.js";
import { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Code Prisma d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "P2002";

/** Ce que les deux adaptateurs sélectionnent d'un contrôle — la ligne ET ses photos. */
const CHECK_SELECT = {
  id: true,
  serviceDay: true,
  targetKind: true,
  sku: true,
  orderId: true,
  quantitySeen: true,
  verdict: true,
  note: true,
  checkedBy: true,
  checkedAt: true,
  photos: {
    select: {
      position: true,
      storageKey: true,
      uploadId: true,
      contentType: true,
      byteSize: true,
    },
  },
} as const;

interface CheckRow {
  readonly id: string;
  readonly serviceDay: string;
  readonly targetKind: string;
  readonly sku: string | null;
  readonly orderId: string | null;
  readonly quantitySeen: number | null;
  readonly verdict: string;
  readonly note: string | null;
  readonly checkedBy: string;
  readonly checkedAt: Date;
  readonly photos: readonly QualityPhotoRef[];
}

/**
 * Le contrôle qualité dans le schéma `production` (plan
 * `plan-controle-qualite.md`, D2).
 *
 * Deux classes pour deux ports — lire une journée et écrire un verdict sont
 * deux besoins (ISP) —, et les mappers en fonctions du module : `toDomain`
 * rehydrate par `QualityCheck.restore`, qui revalide ; `save` lit les getters.
 * Aucun type `Prisma.*` ne sort d'ici.
 */
@Injectable()
export class PrismaQualityCheckRepository extends QualityCheckRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<QualityCheck | null> {
    const row = await this.prisma.productionQualityCheck.findUnique({
      where: { id },
      select: CHECK_SELECT,
    });
    return row === null ? null : toDomain(row);
  }

  /**
   * Une seule écriture imbriquée : le contrôle et ses photos partent ensemble,
   * même hors d'une unité de travail. L'unicité de l'`id` et celle de
   * `upload_id` sont arbitrées par la base — la perdante devient un refus
   * métier, que le handler relit pour l'idempotence.
   */
  async save(check: QualityCheck): Promise<void> {
    try {
      await this.prisma.productionQualityCheck.create({ data: toPersistence(check) });
    } catch (error) {
      const code: unknown = error instanceof Error ? Reflect.get(error, "code") : null;
      if (code === UNIQUE_VIOLATION) {
        throw new QualityCheckWriteRaceError(error);
      }
      throw error;
    }
  }
}

/** La lecture d'une journée de contrôles — cf. l'en-tête du dépôt. */
@Injectable()
export class PrismaQualityCheckReader extends QualityCheckReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forDay(day: ServiceDay): Promise<readonly QualityCheck[]> {
    const rows = await this.prisma.productionQualityCheck.findMany({
      where: { serviceDay: day.value },
      select: CHECK_SELECT,
    });
    return rows.map(toDomain);
  }

  async photo(checkId: string, position: number): Promise<QualityPhotoRef | null> {
    return this.prisma.productionQualityPhoto.findUnique({
      where: { checkId_position: { checkId, position } },
      select: CHECK_SELECT.photos.select,
    });
  }
}

function toDomain(row: CheckRow): QualityCheck {
  return QualityCheck.restore({
    id: row.id,
    serviceDay: ServiceDay.of(row.serviceDay),
    target: {
      kind: row.targetKind,
      sku: row.sku,
      orderId: row.orderId,
      quantitySeen: row.quantitySeen,
    },
    verdict: verdictOf(row),
    note: row.note,
    checkedBy: row.checkedBy,
    checkedAt: row.checkedAt,
    photos: row.photos,
  });
}

function verdictOf(row: CheckRow): QualityVerdict {
  const verdict = QUALITY_VERDICTS.find((known) => known === row.verdict);
  if (verdict === undefined) {
    throw new QualityCheckUnreadableError(row.id, `verdict « ${row.verdict} » inconnu`);
  }
  return verdict;
}

function toPersistence(check: QualityCheck) {
  const target = check.target;
  return {
    id: check.id,
    serviceDay: check.serviceDay.value,
    targetKind: target.kind,
    sku: target.kind === "line" ? target.sku : null,
    orderId: target.kind === "order" ? target.orderId : null,
    quantitySeen: target.kind === "line" ? target.quantitySeen : null,
    verdict: check.verdict,
    note: check.note,
    checkedBy: check.checkedBy,
    checkedAt: check.checkedAt,
    photos: { create: check.photos.map((photo) => ({ ...photo })) },
  };
}
