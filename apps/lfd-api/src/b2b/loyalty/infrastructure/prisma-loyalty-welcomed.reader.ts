import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyWelcomedReader } from "../domain/ports/loyalty-welcomed.reader.js";

/**
 * La ligne `welcome` d'une personne, lue sur l'index partiel `(user_id) WHERE
 * kind = 'welcome'`. Le client est le proxy transactionnel : appelé sous le
 * verrou du titulaire, la lecture voit ce qu'un crédit concurrent vient de
 * commiter.
 */
@Injectable()
export class PrismaLoyaltyWelcomedReader extends LoyaltyWelcomedReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isWelcomed(userId: string): Promise<boolean> {
    const found = await this.prisma.loyaltyLedgerEntry.findFirst({
      where: { kind: "welcome", userId },
      select: { id: true },
    });
    return found !== null;
  }
}
