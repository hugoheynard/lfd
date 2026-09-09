import { Injectable } from "@nestjs/common";
import type { VolumeCommitmentView } from "@lfd/contracts";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { commitmentViewFromRow } from "../../infrastructure/volume-commitment-rows.js";

/**
 * **Le suivi des engagements d'un client** — la promesse, et où on en est.
 *
 * Le volume atteint est **mesuré**, jamais dérivé de la promesse : c'est l'écart
 * entre les deux qui serait toute l'information d'un écran. Un suivi qui
 * afficherait le promis comme s'il était acquis serait pire qu'aucun suivi.
 *
 * ⚠️ Cet écran **n'existe pas** : la route n'a aucun consommateur dans le dépôt,
 * seuls les e2e la traversent (vérifié le 2026-09-09). Ce qui presse sur les
 * engagements n'est donc pas le suivi, c'est la tarification.
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
   * Le volume atteint sur la période, ou `null` s'il n'y a **rien à mesurer**.
   *
   * Sur une famille ou le catalogue entier il n'y a pas de SKU à compter, et la
   * seule mesure disponible compte par SKU.
   *
   * ⚠️ Ce commentaire affirmait que « le suivi s'abstient plutôt que d'inventer
   * un chiffre qui passerait pour une mesure ». L'intention était juste, le type
   * ne la permettait pas : la méthode rendait `0`, et la vue le présentait comme
   * une mesure sous un JSDoc qui disait « mesuré ». Depuis le 2026-09-09
   * l'abstention est **dicible**, donc réelle (R16).
   *
   * 🔴 Cela ne répare PAS la tarification : le tarificateur, lui, substitue
   * toujours le SKU de la ligne au périmètre de l'engagement, et fait un prix
   * avec. La décision de branche est au journal de remédiation.
   */
  private async reached(row: {
    companyId: string;
    scopeType: string;
    scopeId: string | null;
    validFrom: Date;
    validTo: Date;
  }): Promise<number | null> {
    const sku = row.scopeType === "product" || row.scopeType === "variant" ? row.scopeId : null;
    if (sku === null) {
      return null;
    }
    const measured = await this.volumes.volumesFor(row.companyId, [sku], {
      from: row.validFrom,
      to: row.validTo,
    });
    return measured.get(sku) ?? 0;
  }
}
