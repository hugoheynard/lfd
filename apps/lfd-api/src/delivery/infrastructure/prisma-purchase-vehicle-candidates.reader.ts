import type { PurchaseVehicleCandidateView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PurchaseVehicleCandidatesReader } from "../domain/ports/purchase-vehicle-candidates.reader.js";
import { vehicleCandidateViewOf } from "./purchase-vehicle-candidate.mapper.js";

/** Lecture Prisma de la bibliothèque d'achat : sa propre table, jamais celle du réel (B-D1). */
@Injectable()
export class PrismaPurchaseVehicleCandidatesReader extends PurchaseVehicleCandidatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(includeArchived: boolean): Promise<readonly PurchaseVehicleCandidateView[]> {
    const rows = await this.prisma.deliveryPurchaseVehicleCandidate.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(vehicleCandidateViewOf);
  }
}
