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
        { handedOverAt: row.handedOverAt, handedOverBy: row.handedOverBy, via: row.handedOverVia },
      ]),
    );
  }
}
