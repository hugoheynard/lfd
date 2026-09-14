import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../domain/ports/bank-account-guard.reader.js";

/** Adaptateur Prisma du mur du RIB : le rôle du rattachement, et rien d'autre. */
@Injectable()
export class PrismaBankAccountGuardReader extends BankAccountGuardReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    const membership = await this.prisma.membership.findUnique({
      // Clé composite unique : une personne n'a qu'un rattachement par société.
      where: { userId_companyId: { userId, companyId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
