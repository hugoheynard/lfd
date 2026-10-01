import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DriverRoundWall } from "../domain/ports/driver-round-wall.js";

/**
 * Le mur du livreur, lu dans `delivery.delivery_round` — le même `where` que
 * `PrismaDriverRoundsReader` (`driverStaffId` ET `id`). Une requête, sur la
 * clé primaire. Dans une unité de travail, il lit dans sa transaction.
 */
@Injectable()
export class PrismaDriverRoundWall extends DriverRoundWall {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isAssigned(staffUserId: string, roundId: string): Promise<boolean> {
    const found = await this.prisma.deliveryRound.findFirst({
      where: { driverStaffId: staffUserId, id: roundId },
      select: { id: true },
    });
    return found !== null;
  }
}
