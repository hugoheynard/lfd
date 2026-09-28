import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { QualityUpload } from "../../domain/entities/quality-upload.js";
import { QualityUploadRepository } from "../../domain/ports/quality-upload.repository.js";
import { QualityPhoto } from "../../domain/value-objects/quality-photo.js";
import { DepositQualityPhotoCommand } from "./deposit-quality-photo.command.js";

const logger = new Logger("DepositQualityPhoto");

/**
 * **Le dépôt d'une photo de contrôle** — rend son `upload_id`.
 *
 * @sans-journal un dépôt n'est pas un acte : la photo n'est rattachée à rien
 * et se balaie seule au bout de 24 h. L'acte est le VERDICT, qui la rattache et
 * s'inscrit au journal dans sa transaction (D9).
 *
 * Le stockage d'abord, la ligne ensuite : une ligne sans objet ferait échouer
 * le rattachement sur une lecture introuvable, alors qu'un objet sans ligne se
 * retire ici même. Si ce retrait échoue aussi, l'objet reste sous
 * `quality/pending/` — le seul préfixe qu'une règle de cycle de vie peut
 * balayer sans risque (D8).
 */
@CommandHandler(DepositQualityPhotoCommand)
export class DepositQualityPhotoHandler implements ICommandHandler<
  DepositQualityPhotoCommand,
  string
> {
  constructor(
    private readonly uploads: QualityUploadRepository,
    private readonly store: ProductionDocumentStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: DepositQualityPhotoCommand): Promise<string> {
    const photo = QualityPhoto.create(command.bytes);
    const upload = QualityUpload.deposit({
      id: this.ids.next(),
      photo,
      uploadedBy: command.staffUserId,
      uploadedAt: this.clock.now(),
    });
    await this.store.save(upload.storageKey, {
      bytes: photo.bytes,
      contentType: photo.contentType,
    });
    try {
      await this.uploads.record(upload);
    } catch (error) {
      await this.store.delete(upload.storageKey).catch((cause: unknown) => {
        logger.warn(`Dépôt ${upload.id} orphelin au stockage : ${String(cause)}`);
      });
      throw error;
    }
    return upload.id;
  }
}
