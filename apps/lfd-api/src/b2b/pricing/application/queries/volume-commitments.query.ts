import { Injectable } from "@nestjs/common";
import type { VolumeCommitmentView } from "@lfd/contracts";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { commitmentViewFromRow } from "../../infrastructure/volume-commitment-rows.js";

/**
 * **Le suivi des engagements d'un client** — la promesse, et où on en est.
 *
 * Le volume atteint est **mesuré**, jamais dérivé de la promesse : c'est l'écart
 * entre les deux qui est toute l'information de l'écran. Un suivi qui afficherait
 * le promis comme s'il était acquis serait pire qu'aucun suivi.
 *
 * Une mesure par engagement, et c'est assumé : un client en a un, deux, rarement
 * plus. Les grouper supposerait une fenêtre commune, que deux engagements de
 * périodes différentes n'ont justement pas.
 */
@Injectable()
export class VolumeCommitmentsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volumes: CustomerVolumeReader,
  ) {}

  async forCompany(companyId: string): Promise<readonly VolumeCommitmentView[]> {
    const rows = await this.prisma.volumeCommitment.findMany({
      where: { companyId },
      orderBy: { validFrom: "desc" },
    });
    return Promise.all(
      rows.map(async (row) => commitmentViewFromRow(row, await this.reached(row))),
    );
  }

  /**
   * Le volume atteint sur la période.
   *
   * `0` quand la portée n'est pas un article : sur une famille ou le catalogue
   * entier il n'y a pas de SKU à mesurer, et le suivi s'abstient plutôt que
   * d'inventer un chiffre qui passerait pour une mesure.
   */
  private async reached(row: {
    companyId: string;
    scopeType: string;
    scopeId: string | null;
    validFrom: Date;
    validTo: Date;
  }): Promise<number> {
    const sku = row.scopeType === "product" || row.scopeType === "variant" ? row.scopeId : null;
    if (sku === null) {
      return 0;
    }
    const measured = await this.volumes.volumesFor(row.companyId, [sku], {
      from: row.validFrom,
      to: row.validTo,
    });
    return measured.get(sku) ?? 0;
  }
}
