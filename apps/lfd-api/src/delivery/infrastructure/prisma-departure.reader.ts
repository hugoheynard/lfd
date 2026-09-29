import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DepartureReader } from "../domain/ports/departure.reader.js";
import { DEPARTURE_KEY } from "./departure.key.js";

/** Adaptateur Prisma de la lecture du départ choisi. */
@Injectable()
export class PrismaDepartureReader extends DepartureReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async chosenPickupAddressId(): Promise<string | null> {
    const row = await this.prisma.deliveryDeparture.findUnique({
      where: { key: DEPARTURE_KEY },
      select: { pickupAddressId: true },
    });
    return row?.pickupAddressId ?? null;
  }
}
