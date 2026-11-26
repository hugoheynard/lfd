import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InHouseMonthPayersReader } from "../domain/ports/in-house-month-payers.reader.js";
import {
  type InHousePeriod,
  InHousePeriodsReader,
} from "../domain/ports/in-house-periods.reader.js";

/** Les payeurs maison d'une fenêtre : une période qui la touche, vivante ou close. */
@Injectable()
export class PrismaInHouseMonthPayersReader extends InHouseMonthPayersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async payersInHouseDuring(window: {
    readonly from: Date;
    readonly to: Date;
  }): Promise<readonly string[]> {
    const rows = await this.prisma.payerInHouse.findMany({
      where: {
        declaredAt: { lt: window.to },
        OR: [{ withdrawnAt: null }, { withdrawnAt: { gt: window.from } }],
      },
      select: { companyId: true },
      distinct: ["companyId"],
    });
    return rows.map((row) => row.companyId);
  }
}

/** Les périodes maison d'un payeur, de la plus ancienne à la plus récente. */
@Injectable()
export class PrismaInHousePeriodsReader extends InHousePeriodsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  periodsOf(payerId: string): Promise<readonly InHousePeriod[]> {
    return this.prisma.payerInHouse.findMany({
      where: { companyId: payerId },
      select: { declaredAt: true, withdrawnAt: true },
      orderBy: { declaredAt: "asc" },
    });
  }
}
