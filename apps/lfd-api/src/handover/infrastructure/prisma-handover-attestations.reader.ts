import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../domain/ports/handover-attestations.reader.js";

/** Les attestations d'un lot de commandes, en une requête. */
@Injectable()
export class PrismaHandoverAttestationsReader extends HandoverAttestationsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, AttestedHandover>> {
    if (orderIds.length === 0) {
      // Un `IN ()` vide est une requête qui ne peut rien rendre : on ne la pose
      // pas. Ce n'est pas une micro-optimisation — Prisma la traduit en SQL
      // valide, et payer un aller-retour pour un ensemble vide est le genre de
      // détail qui se multiplie par le nombre d'écrans.
      return new Map();
    }
    const rows = await this.prisma.orderHandover.findMany({
      where: { orderId: { in: [...orderIds] } },
      select: { orderId: true, handedOverAt: true, handedOverBy: true, handedOverVia: true },
    });
    return new Map(
      rows.map((row) => [
        row.orderId,
        {
          handedOverAt: row.handedOverAt,
          handedOverBy: row.handedOverBy,
          // 🔴 La colonne est un `text` : c'est ICI qu'on la referme sur les
          // deux valeurs du domaine, comme le fait déjà le dépôt qui réhydrate
          // une attestation. Une ligne écrite à la main hors du domaine ne doit
          // pas devenir un `via` inconnu à l'écran — et surtout pas passer pour
          // un `scan`, qui est l'attestation forte. Tout ce qui n'est pas
          // exactement « scan » est donc faible.
          via: row.handedOverVia === "scan" ? ("scan" as const) : ("manual" as const),
        },
      ]),
    );
  }
}
