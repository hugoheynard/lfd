import { Injectable, Logger } from "@nestjs/common";

import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { MAX_QUALITY_PHOTOS, type QualityPhotoRef } from "../../domain/entities/quality-check.js";
import type { QualityUpload } from "../../domain/entities/quality-upload.js";
import {
  QualityCheckPhotoPositionError,
  QualityCheckTooManyPhotosError,
} from "../../domain/errors/quality-check-errors.js";
import { QualityUploadNotFoundError } from "../../domain/errors/quality-record-errors.js";
import { QualityUploadRepository } from "../../domain/ports/quality-upload.repository.js";
import {
  pendingQualityPhotoKey,
  qualityPhotoKey,
} from "../../domain/services/quality-storage-keys.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

const logger = new Logger("QualityPhotoAttachment");

/** Ce que le rattachement doit savoir du contrôle qui l'accueille. */
export interface AttachmentTarget {
  readonly checkId: string;
  readonly serviceDay: ServiceDay;
  readonly staffUserId: string;
}

/**
 * **Rattacher des dépôts à un verdict** — la seconde moitié du geste (D8).
 *
 * Le stockage objet n'entre dans aucune transaction, donc le déplacement se fait
 * en trois temps, et chacun laisse un état sûr s'il échoue :
 *
 * 1. {@link copy}, AVANT la transaction : chaque dépôt est relu et réécrit sous
 *    `quality/<jour>/<contrôle>/<position>`. Le store n'a pas d'opération de
 *    copie (`DocumentStore`, vérifié le 2026-09-28) : c'est lire + écrire. Un
 *    échec ici n'a rien écrit en base ; les copies déjà faites restent sous une
 *    clé que seul CE contrôle peut reprendre — un rejeu du même `id` les
 *    réécrase, et rien ne les lit tant que la ligne n'existe pas ;
 * 2. la transaction du handler écrit les lignes de photos ;
 * 3. {@link release}, APRÈS : l'objet provisoire est retiré. Un échec n'est
 *    qu'un reste sous `quality/pending/`, que le balayage rattrape.
 */
@Injectable()
export class QualityPhotoAttachment {
  constructor(
    private readonly uploads: QualityUploadRepository,
    private readonly store: ProductionDocumentStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Vérifie les dépôts, puis les copie à leur place définitive. L'ordre reçu
   * est l'ordre d'affichage.
   *
   * @throws {QualityCheckTooManyPhotosError} plus de six dépôts.
   * @throws {QualityUploadNotFoundError} un dépôt inconnu, ou d'une autre personne.
   * @throws ce que lève `QualityUpload.assertAttachableBy`.
   */
  async copy(
    uploadIds: readonly string[],
    target: AttachmentTarget,
  ): Promise<readonly QualityPhotoRef[]> {
    const uploads = await this.attachable(uploadIds, target.staffUserId);
    const photos: QualityPhotoRef[] = [];
    for (const [position, upload] of uploads.entries()) {
      const storageKey = qualityPhotoKey(target.serviceDay, target.checkId, position);
      const bytes = await this.store.read(upload.storageKey);
      await this.store.save(storageKey, { bytes, contentType: upload.contentType });
      photos.push({
        position,
        storageKey,
        uploadId: upload.id,
        contentType: upload.contentType,
        byteSize: upload.byteSize,
      });
    }
    return photos;
  }

  /** Retire les objets provisoires. Ne lève jamais : le balayage est le filet. */
  async release(photos: readonly QualityPhotoRef[]): Promise<void> {
    if (photos.length === 0) {
      return;
    }
    try {
      for (const photo of photos) {
        await this.store.delete(pendingQualityPhotoKey(photo.uploadId));
      }
      await this.uploads.markReleased(
        photos.map((photo) => photo.uploadId),
        this.clock.now(),
      );
    } catch (cause) {
      logger.warn(`Dépôts non libérés après verdict, le balayage les reprendra : ${String(cause)}`);
    }
  }

  private async attachable(
    uploadIds: readonly string[],
    staffUserId: string,
  ): Promise<readonly QualityUpload[]> {
    if (uploadIds.length > MAX_QUALITY_PHOTOS) {
      throw new QualityCheckTooManyPhotosError(uploadIds.length, MAX_QUALITY_PHOTOS);
    }
    if (new Set(uploadIds).size !== uploadIds.length) {
      throw new QualityCheckPhotoPositionError("la même photo est jointe deux fois");
    }
    const found = new Map((await this.uploads.loadMany(uploadIds)).map((u) => [u.id, u]));
    return uploadIds.map((uploadId) => {
      const upload = found.get(uploadId);
      if (upload === undefined) {
        throw new QualityUploadNotFoundError(uploadId);
      }
      upload.assertAttachableBy(staffUserId);
      return upload;
    });
  }
}
