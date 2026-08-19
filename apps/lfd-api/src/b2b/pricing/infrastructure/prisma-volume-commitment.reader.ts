import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VolumeCommitmentReader } from "../domain/ports/volume-commitment.reader.js";
import { commitmentStateFromRow } from "./volume-commitment-rows.js";
import type { VolumeCommitment } from "../domain/volume-commitment.js";

@Injectable()
export class PrismaVolumeCommitmentReader extends VolumeCommitmentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un client de passage n'a pas d'engagement, et la question ne se pose même
   * pas : on rend `[]` **sans requête**. Le parcours zéro friction est le plus
   * fréquent de la boutique ; lui faire payer une lecture inutile à chaque ligne
   * de panier serait le ralentir pour une réponse connue d'avance.
   */
  async liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    if (companyId === null) {
      return [];
    }
    const rows = await this.prisma.volumeCommitment.findMany({
      where: { companyId, archivedAt: null },
    });
    return rows.map((row) => {
      const state = commitmentStateFromRow(row);
      return {
        id: state.id,
        companyId: state.companyId,
        scope: state.scope,
        promisedQuantity: state.promisedQuantity,
        validFrom: state.validFrom,
        validTo: state.validTo,
      };
    });
  }
}
