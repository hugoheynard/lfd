import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { QUALITY_UPLOAD_TTL_MS } from "../../domain/entities/quality-upload.js";
import { QualityUploadRepository } from "../../domain/ports/quality-upload.repository.js";
import { SweepQualityUploadsCommand } from "./sweep-quality-uploads.command.js";

/** Au plus deux cents dépôts par passage : le suivant reprendra le reste. */
const SWEEP_BATCH = 200;

/**
 * **Le balayage des dépôts provisoires** — une photo déposée puis abandonnée
 * ne coûte qu'une nuit (D8).
 *
 * @sans-journal un nettoyage de stockage, déclenché par la machine : aucun
 * acte de personne, et rien de ce qu'un contrôle affirme ne change.
 *
 * Il retire l'objet de `quality/pending/<id>` de tout dépôt de plus de 24 h
 * encore présent — jamais rattaché, OU rattaché mais dont la libération a
 * échoué juste après son verdict : la photo est déjà copiée à sa place, seul
 * le provisoire part. Un dépôt balayé sans verdict ne se rattache plus
 * (`QualityUploadReleasedError`).
 *
 * `delete` est idempotent : un objet déjà absent est un succès, donc un
 * passage interrompu se rejoue sans dommage.
 */
@CommandHandler(SweepQualityUploadsCommand)
export class SweepQualityUploadsHandler implements ICommandHandler<
  SweepQualityUploadsCommand,
  number
> {
  constructor(
    private readonly uploads: QualityUploadRepository,
    private readonly store: ProductionDocumentStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    const before = new Date(now.getTime() - QUALITY_UPLOAD_TTL_MS);
    const stale = await this.uploads.releasable(before, SWEEP_BATCH);
    for (const upload of stale) {
      await this.store.delete(upload.storageKey);
    }
    await this.uploads.markReleased(
      stale.map((upload) => upload.id),
      now,
    );
    return stale.length;
  }
}
