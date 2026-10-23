import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PayerStanding } from "../domain/ports/payer-standing.reader.js";
import { PayerStandingsReader } from "../domain/ports/payer-standings.reader.js";
import { payerStandingOf, payerStandingSelect } from "./payer-standing.mapper.js";

/** Tous les comptes, et leurs périodes `billing` qui couvrent l'instant. */
@Injectable()
export class PrismaPayerStandingsReader extends PayerStandingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allAt(at: Date): Promise<readonly PayerStanding[]> {
    const rows = await this.prisma.company.findMany({ select: payerStandingSelect(at) });
    return rows.map(payerStandingOf);
  }
}
