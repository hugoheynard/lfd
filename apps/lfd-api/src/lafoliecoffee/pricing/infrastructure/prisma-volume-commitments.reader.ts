import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  VolumeCommitmentsReader,
  type StoredVolumeCommitment,
} from "../application/ports/volume-commitments.reader.js";
import { commitmentStateFromRow } from "./volume-commitment-rows.js";

/** Le suivi des engagements d'un client — **tous**, pas seulement les vivants. */
@Injectable()
export class PrismaVolumeCommitmentsReader extends VolumeCommitmentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allFor(companyId: string): Promise<readonly StoredVolumeCommitment[]> {
    const rows = await this.prisma.volumeCommitment.findMany({
      where: { companyId },
      orderBy: { validFrom: "desc" },
    });
    return rows.map((row) => ({ state: commitmentStateFromRow(row), createdAt: row.createdAt }));
  }
}
