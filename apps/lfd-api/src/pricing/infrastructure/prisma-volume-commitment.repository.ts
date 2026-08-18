import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { VolumeCommitmentAggregate } from "../domain/entities/volume-commitment.js";
import { VolumeCommitmentRepository } from "../domain/ports/volume-commitment.repository.js";
import { OverlappingVolumeCommitmentError } from "../domain/pricing-errors.js";
import { commitmentStateFromRow } from "./volume-commitment-rows.js";

/**
 * **Le nom de la contrainte**, et non son SQLSTATE — même raison que sur les
 * règles et les barèmes : l'adaptateur `pg` remonte la phrase de Postgres sans
 * le code, et ce nom-là est à nous, il désigne *cette* règle métier.
 */
const OVERLAP_CONSTRAINT = "volume_commitments_no_overlap";

@Injectable()
export class PrismaVolumeCommitmentRepository extends VolumeCommitmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async sign(commitment: VolumeCommitmentAggregate): Promise<void> {
    const state = commitment.toPersistence();
    try {
      await this.prisma.volumeCommitment.create({
        data: {
          id: state.id,
          companyId: state.companyId,
          scopeType: state.scope.type,
          scopeId: state.scope.id,
          promisedQuantity: state.promisedQuantity,
          validFrom: state.validFrom,
          validTo: state.validTo,
          createdBy: state.createdBy,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT)) {
        throw new OverlappingVolumeCommitmentError();
      }
      throw error;
    }
  }

  async load(id: string): Promise<VolumeCommitmentAggregate | null> {
    const row = await this.prisma.volumeCommitment.findUnique({ where: { id } });
    return row === null
      ? null
      : VolumeCommitmentAggregate.reconstitute(commitmentStateFromRow(row));
  }

  /** Seul le cycle de vie bouge : la période et le volume visé sont scellés. */
  async save(commitment: VolumeCommitmentAggregate): Promise<void> {
    const state = commitment.toPersistence();
    await this.prisma.volumeCommitment.update({
      where: { id: state.id },
      data: {
        archivedAt: state.archivedAt,
        archivedBy: state.archivedBy,
        archiveReason: state.archiveReason,
      },
    });
  }
}
