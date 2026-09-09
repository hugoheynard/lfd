import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VolumeCommitmentReader } from "../domain/ports/volume-commitment.reader.js";
import { unarchivedAt, type UnarchivedAtClause } from "./archived-at.js";
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
    return this.readWhere(companyId, { archivedAt: null });
  }

  /**
   * La relecture datée : les engagements **clos après `at`** sont rendus, parce
   * qu'ils couraient ce jour-là. Clore borne désormais leur fenêtre, donc le
   * domaine sait les écarter à la bonne date ; c'était la clause d'archivage qui
   * les faisait disparaître du passé (R17).
   */
  async liveAsOf(companyId: string | null, at: Date): Promise<readonly VolumeCommitment[]> {
    return this.readWhere(companyId, unarchivedAt(at));
  }

  /**
   * La lecture partagée par les deux questions : une seule projection ligne →
   * engagement, donc aucun champ ne peut se retrouver dans l'une et pas dans
   * l'autre.
   */
  private async readWhere(
    companyId: string | null,
    archival: { archivedAt: null } | UnarchivedAtClause,
  ): Promise<readonly VolumeCommitment[]> {
    if (companyId === null) {
      return [];
    }
    const rows = await this.prisma.volumeCommitment.findMany({
      where: { AND: [{ companyId }, archival] },
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
