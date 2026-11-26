import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InHousePayerReader } from "../domain/ports/in-house-payer.reader.js";

/** « Ce payeur est-il maison ? » — sa période vivante, par l'index unique partiel. */
@Injectable()
export class PrismaInHousePayerReader extends InHousePayerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isInHousePayer(payerId: string): Promise<boolean> {
    const row = await this.prisma.payerInHouse.findFirst({
      where: { companyId: payerId, withdrawnAt: null },
      select: { id: true },
    });
    return row !== null;
  }
}
