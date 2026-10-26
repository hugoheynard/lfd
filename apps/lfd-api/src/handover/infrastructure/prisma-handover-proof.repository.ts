import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { HandoverProof } from "../domain/entities/handover-proof.js";
import { HandoverProofRepository } from "../domain/ports/handover-proof.repository.js";
import type { ShipmentRef } from "../../production/channels/handover/index.js";
import { shipmentKey } from "./first-shipment.key.js";

/**
 * Les pièces des remises à la porte (`production.order_handover_proof`,
 * rangée avec `order_handover` : le retrait n'a pas de schéma à lui).
 *
 * `create` nu : la clé est l'envoi `(commande, rang)` (L3d), et l'attestation écrite juste avant
 * dans la même transaction est déjà unique — une seconde pièce pour la même
 * commande ne peut pas arriver jusqu'ici.
 */
@Injectable()
export class PrismaHandoverProofRepository extends HandoverProofRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByShipment(shipment: ShipmentRef): Promise<HandoverProof | null> {
    const row = await this.prisma.orderHandoverProof.findUnique({
      where: shipmentKey(shipment),
    });
    return row === null ? null : HandoverProof.rehydrate(row);
  }

  async findAllOfOrder(orderId: string): Promise<readonly HandoverProof[]> {
    const rows = await this.prisma.orderHandoverProof.findMany({
      where: { orderId },
      orderBy: { rank: "asc" },
    });
    return rows.map((row) => HandoverProof.rehydrate(row));
  }

  async record(proof: HandoverProof): Promise<void> {
    await this.prisma.orderHandoverProof.create({ data: { ...proof.state } });
  }
}
