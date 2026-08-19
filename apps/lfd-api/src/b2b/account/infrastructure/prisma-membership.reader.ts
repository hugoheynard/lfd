import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MembershipReader } from "../domain/ports/membership.reader.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";

/** Adaptateur Prisma du lecteur de rôle. */
@Injectable()
export class PrismaMembershipReader extends MembershipReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<CompanyRole | null> {
    const membership = await this.prisma.membership.findUnique({
      // La clé composite unique (userId, companyId) : une personne n'a qu'un
      // rattachement par entreprise, donc au plus un rôle.
      where: { userId_companyId: { userId, companyId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
