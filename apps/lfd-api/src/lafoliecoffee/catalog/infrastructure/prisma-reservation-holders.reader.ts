import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { HoldersWithMenu } from "../../shared/company-standing/domain/sub-account-menu-reading.js";
import { readReservationHolders } from "../../shared/company-standing/infrastructure/read-reservation-holders.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/** La requête partagée, derrière le port du catalogue. */
@Injectable()
export class PrismaReservationHoldersReader extends ReservationHoldersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  holdersOf(companyId: string): Promise<HoldersWithMenu> {
    return readReservationHolders(this.prisma, companyId);
  }
}
