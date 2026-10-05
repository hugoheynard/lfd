import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnpaidAccessReader, type UnpaidAccessRole } from "../domain/ports/unpaid-access.reader.js";

/** Le rôle du rattachement, et rien d'autre. */
@Injectable()
export class PrismaUnpaidAccessReader extends UnpaidAccessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<UnpaidAccessRole | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
