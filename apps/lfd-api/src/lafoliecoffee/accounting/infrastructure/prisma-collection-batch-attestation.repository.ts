import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CollectionBatchAttestations,
  batchAttestationKindOf,
} from "../domain/entities/collection-batch-attestation.js";
import { CollectionBatchAttestationRepository } from "../domain/ports/collection-batch-attestation.repository.js";

/**
 * Adaptateur d'écriture des attestations d'un lot. Registre d'ajouts : `save`
 * n'insère que les lignes nouvelles de l'agrégat — la base refuse de toute
 * façon UPDATE et DELETE (`collection_batch_attestation_append_only`). Le lot
 * n'est que LU, pour l'ordre de la procédure et son nom au journal.
 */
@Injectable()
export class PrismaCollectionBatchAttestationRepository extends CollectionBatchAttestationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(batchId: string): Promise<CollectionBatchAttestations | null> {
    const batch = await this.prisma.collectionBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        legalEntityId: true,
        scheme: true,
        status: true,
        cycleClosesAt: true,
        attestations: { orderBy: [{ attestedAt: "asc" }, { id: "asc" }] },
      },
    });
    if (batch === null) {
      return null;
    }
    const { attestations, ...attested } = batch;
    return CollectionBatchAttestations.rehydrate({
      batch: attested,
      entries: attestations.map((row) => ({
        id: row.id,
        batchId: row.batchId,
        kind: batchAttestationKindOf(row.kind),
        at: row.attestedAt,
        staffId: row.attestedByStaffId,
        withdrawn: row.withdrawn,
        note: row.note,
      })),
    });
  }

  async save(attestations: CollectionBatchAttestations): Promise<void> {
    const entries = attestations.newEntries();
    if (entries.length === 0) {
      return;
    }
    await this.prisma.collectionBatchAttestation.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        batchId: entry.batchId,
        kind: entry.kind,
        attestedAt: entry.at,
        attestedByStaffId: entry.staffId,
        withdrawn: entry.withdrawn,
        note: entry.note,
      })),
    });
  }
}
