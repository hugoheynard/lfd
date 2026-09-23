import { Injectable } from "@nestjs/common";

import { MediaPrismaService } from "../infra/database/media-prisma.service.js";
import { MediaIdGenerator } from "../infra/id/media-id-generator.js";
import {
  MediaFailureLog,
  type LoggedFailure,
  type RefusedDeposit,
} from "../domain/ports/media-failure-log.js";

/**
 * Le plafond du nom de fichier, aligné sur la colonne (`VARCHAR(255)`).
 *
 * 🔴 Tronqué ICI plutôt que laissé à Postgres : un nom trop long ferait lever
 * la base, donc **échouer l'inscription d'un refus** — et on perdrait
 * l'information précisément sur le fichier le plus inhabituel du lot.
 */
const MAX_NAME = 255;
const MAX_REASON = 500;
const MAX_CODE = 120;
const MAX_TYPE = 120;

/** Coupe sans jamais lever : une borne de colonne n'est pas une règle métier. */
function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * L'historique des dépôts refusés, en base.
 *
 * ⚠️ **`record` n'échoue jamais vers l'appelant.** Un historique qui ferait
 * tomber un dépôt déjà refusé changerait le message reçu par l'écran : il
 * perdrait la raison du refus — celle qui dit quoi corriger — au profit d'une
 * panne d'écriture. C'est l'inverse du service rendu, et c'est pourquoi
 * l'échec est avalé ICI, à l'endroit où on peut dire pourquoi.
 *
 * C'est la seule exception au « jamais d'erreur avalée en silence » de ce
 * dépôt, et elle n'est pas silencieuse : elle est écrite, et elle ne couvre
 * qu'une écriture d'observation qui ne conditionne rien.
 */
@Injectable()
export class PrismaMediaFailureLog extends MediaFailureLog {
  constructor(
    private readonly prisma: MediaPrismaService,
    private readonly ids: MediaIdGenerator,
  ) {
    super();
  }

  async record(failure: RefusedDeposit): Promise<void> {
    try {
      await this.prisma.mediaUploadFailure.create({
        data: {
          id: this.ids.next(),
          fileName: clip(failure.fileName, MAX_NAME),
          reason: clip(failure.reason, MAX_REASON),
          code: clip(failure.code, MAX_CODE),
          bytes: failure.bytes,
          contentType: failure.contentType === null ? null : clip(failure.contentType, MAX_TYPE),
        },
      });
    } catch {
      // Avalé, et dit : voir le JSDoc de la classe. Le refus du dépôt part de
      // toute façon à l'appelant, avec sa raison — c'est lui qui compte.
    }
  }

  async recent(limit: number): Promise<readonly LoggedFailure[]> {
    const rows = await this.prisma.mediaUploadFailure.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      reason: row.reason,
      code: row.code,
      bytes: row.bytes,
      contentType: row.contentType,
      actorName: row.actorName,
      occurredAt: row.occurredAt,
    }));
  }

  async forgetBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.mediaUploadFailure.deleteMany({
      where: { occurredAt: { lt: before } },
    });
    return count;
  }
}
