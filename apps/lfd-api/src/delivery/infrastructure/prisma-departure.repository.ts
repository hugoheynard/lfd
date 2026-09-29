import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DepartureChoice } from "../domain/entities/departure-choice.js";
import { DepartureRepository } from "../domain/ports/departure.repository.js";
import { DEPARTURE_KEY } from "./departure.key.js";

/** Adaptateur Prisma de l'écriture du départ : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaDepartureRepository extends DepartureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(choice: DepartureChoice): Promise<void> {
    const row = {
      pickupAddressId: choice.pickupAddressId,
      updatedAt: choice.at,
      updatedByStaffId: choice.author.staffUserId,
      updatedByName: choice.author.name,
      updatedByRole: choice.author.role,
    };
    await this.prisma.deliveryDeparture.upsert({
      where: { key: DEPARTURE_KEY },
      create: { key: DEPARTURE_KEY, ...row },
      update: row,
    });
  }
}
