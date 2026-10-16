import type { OperationsMigrationReport } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ReferentialOperations } from "../../../../pim/channels/b2b-platform/operations/referential-operations.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { MirroredOperationsReader } from "../../domain/ports/mirrored-operations.reader.js";
import { OperationSkuCatalogue } from "../../domain/ports/operation-sku.catalogue.js";
import { readMigration, reportOf } from "../migration/migration-sources.js";
import { PreviewOperationsMigrationQuery } from "./preview-operations-migration.query.js";

/**
 * **Ce que la migration écrirait** — à relire AVANT d'ouvrir l'interrupteur
 * (runbook, « Bascule des opérations »), et à relire encore après : c'est le
 * même relevé que l'application rend.
 *
 * Utilisable interrupteur fermé : c'est l'aperçu que Hugo relit avant de
 * poser `OPERATIONS_AT_COMMERCE=true`. L'APPLICATION, elle, exige l'ouverture.
 */
@QueryHandler(PreviewOperationsMigrationQuery)
export class PreviewOperationsMigrationHandler implements IQueryHandler<
  PreviewOperationsMigrationQuery,
  OperationsMigrationReport
> {
  constructor(
    private readonly referential: ReferentialOperations,
    private readonly mirror: MirroredOperationsReader,
    private readonly skus: OperationSkuCatalogue,
    private readonly library: OperationImageLibrary,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<OperationsMigrationReport> {
    const now = this.clock.now();
    const reading = await readMigration(
      {
        referential: this.referential,
        mirror: this.mirror,
        skus: this.skus,
        library: this.library,
      },
      now,
    );
    return reportOf(reading, now);
  }
}
