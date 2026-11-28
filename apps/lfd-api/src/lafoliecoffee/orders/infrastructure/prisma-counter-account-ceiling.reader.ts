import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterAccountCeilingReader } from "../domain/ports/counter-account-ceiling.reader.js";

/** La clé de l'unique ligne du réglage. */
const SETTINGS_KEY = "orders";

/** Adaptateur Prisma du plafond : ligne absente = aucun plafond. */
@Injectable()
export class PrismaCounterAccountCeilingReader extends CounterAccountCeilingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ceilingCents(): Promise<number | null> {
    const row = await this.prisma.counterAccountSettings.findUnique({
      where: { key: SETTINGS_KEY },
      select: { ceilingCents: true },
    });
    return row?.ceilingCents ?? null;
  }
}
