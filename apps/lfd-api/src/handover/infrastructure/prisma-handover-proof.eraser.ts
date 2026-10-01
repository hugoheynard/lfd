import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { HandoverProof } from "../domain/entities/handover-proof.js";
import { HandoverProofEraser } from "../domain/ports/handover-proof.eraser.js";

/**
 * L'effacement des pièces (`production.order_handover_proof`). Un DELETE
 * physique, et c'est l'objet : une pièce effacée pour la conservation ou à la
 * demande d'une personne ne doit plus exister nulle part — un statut « effacé »
 * garderait le nom. L'attestation, elle, n'est pas touchée.
 */
@Injectable()
export class PrismaHandoverProofEraser extends HandoverProofEraser {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordedBefore(cutoff: Date): Promise<readonly HandoverProof[]> {
    const rows = await this.prisma.orderHandoverProof.findMany({
      where: { recordedAt: { lt: cutoff } },
      orderBy: { recordedAt: "asc" },
    });
    return rows.map((row) => HandoverProof.rehydrate(row));
  }

  async erase(orderId: string): Promise<boolean> {
    const { count } = await this.prisma.orderHandoverProof.deleteMany({ where: { orderId } });
    return count > 0;
  }
}
