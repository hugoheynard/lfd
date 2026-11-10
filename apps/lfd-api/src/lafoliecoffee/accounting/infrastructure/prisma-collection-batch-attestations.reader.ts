import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { batchAttestationKindOf } from "../domain/entities/collection-batch-attestation.js";
import { CollectionBatchAttestationsReader } from "../domain/ports/collection-batch-attestations.reader.js";
import type { BatchAttestationLine } from "../domain/services/collection-batch-attestations.js";

/** Lecture des attestations des lots : toutes leurs lignes, d'un coup. */
@Injectable()
export class PrismaCollectionBatchAttestationsReader extends CollectionBatchAttestationsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofBatches(batchIds: readonly string[]): Promise<readonly BatchAttestationLine[]> {
    const rows = await this.prisma.collectionBatchAttestation.findMany({
      where: { batchId: { in: [...batchIds] } },
      orderBy: [{ attestedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        batchId: true,
        kind: true,
        attestedAt: true,
        attestedByStaffId: true,
        withdrawn: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      kind: batchAttestationKindOf(row.kind),
      at: row.attestedAt,
      staffId: row.attestedByStaffId,
      withdrawn: row.withdrawn,
    }));
  }
}
