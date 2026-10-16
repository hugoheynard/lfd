import type { OperationsMigrationReport } from "@lfd/contracts";

import type {
  ReferentialOperation as ChannelOperation,
  ReferentialOperations,
} from "../../../../pim/channels/b2b-platform/operations/referential-operations.js";
import type { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import type { ReferentialOperation } from "../../domain/entities/operation.js";
import type { MirroredOperationsReader } from "../../domain/ports/mirrored-operations.reader.js";
import type { OperationSkuCatalogue } from "../../domain/ports/operation-sku.catalogue.js";
import type { OperationFocal } from "../../domain/value-objects/operation-image.js";
import {
  planOperationMigration,
  type MigrationLine,
} from "../../domain/services/operation-migration.js";
import { restricts } from "../../domain/services/operation-restriction.js";

/** Les ports que l'aperçu et l'application lisent — les mêmes, pour le même plan. */
export interface MigrationReaders {
  readonly referential: ReferentialOperations;
  readonly mirror: MirroredOperationsReader;
  readonly skus: OperationSkuCatalogue;
  readonly library: OperationImageLibrary;
}

/** Ce qu'une lecture rend : le plan, et de quoi le compter. */
export interface MigrationReading {
  readonly lines: readonly MigrationLine[];
  readonly referentialCount: number;
  readonly mirrorCount: number;
  readonly restrictionCount: number;
}

/**
 * **Lire les trois sources et faire le plan** — partagé par l'aperçu et
 * l'application, pour qu'elles ne puissent pas diverger : ce que l'aperçu a
 * montré est ce que l'application écrit.
 */
export async function readMigration(
  readers: MigrationReaders,
  now: Date,
): Promise<MigrationReading> {
  const [channel, mirror] = await Promise.all([readers.referential.list(), readers.mirror.list()]);
  const referential = channel.map(fromChannel);
  const allSkus = [...new Set(referential.flatMap((operation) => operation.skus))];
  const urls = referential.flatMap((operation) =>
    operation.image === null ? [] : [operation.image.url],
  );
  const [unknown, described] = await Promise.all([
    readers.skus.unknownAmong(allSkus),
    readers.library.describeMany(urls),
  ]);
  const focals = new Map<string, OperationFocal | null>(
    [...described.values()].map((image) => [image.url, image.focal]),
  );
  return {
    lines: planOperationMigration({
      referential,
      mirror,
      unknownSkus: new Set(unknown),
      focals,
      now,
    }),
    referentialCount: referential.length,
    mirrorCount: mirror.length,
    restrictionCount: mirror.filter((row) => restricts(row.restriction)).length,
  };
}

/** Le plan en relevé, tel que l'écran le lit. */
export function reportOf(reading: MigrationReading, readAt: Date): OperationsMigrationReport {
  const count = (outcome: MigrationLine["outcome"]) =>
    reading.lines.filter((line) => line.outcome === outcome).length;
  const blocked = count("blocked");
  return {
    readAt: readAt.toISOString(),
    counts: {
      referential: reading.referentialCount,
      mirror: reading.mirrorCount,
      restrictions: reading.restrictionCount,
      toWrite: count("create") + count("adopt"),
      alreadyAtCommerce: count("already_at_commerce"),
      mirrorOnly: count("mirror_only"),
      blocked,
    },
    blocked: blocked > 0,
    operations: reading.lines.map((line) => ({
      key: line.key,
      name: line.name,
      outcome: line.outcome,
      fields: line.fields,
      droppedSkus: line.droppedSkus,
      restriction:
        line.restriction === null
          ? null
          : {
              isHidden: line.restriction.isHidden,
              orderUntil: line.restriction.orderUntil?.toISOString() ?? null,
              audience: line.restriction.audience,
              hiddenSkus: line.restriction.hiddenSkus,
              decidedBy: line.restriction.decidedBy,
              decidedAt: line.restriction.decidedAt.toISOString(),
            },
      problems: line.problems,
    })),
  };
}

/** Le canal du référentiel dans la forme de l'agrégat. Le référentiel ne masquait pas. */
function fromChannel(operation: ChannelOperation): ReferentialOperation {
  return {
    key: operation.key,
    name: operation.name,
    lede: operation.lede,
    image: operation.image === null ? null : { url: operation.image.url },
    schedule: {
      announceFrom: operation.announceFrom,
      orderFrom: operation.orderFrom,
      orderUntil: operation.orderUntil,
      pickupFrom: operation.pickupFrom,
      pickupUntil: operation.pickupUntil,
    },
    audience: operation.audience,
    skus: operation.skus,
    hidden: false,
    archivedAt: operation.archivedAt,
  };
}
