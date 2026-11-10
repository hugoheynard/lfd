import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerRequestRetention } from "../domain/ports/customer-request.retention.js";

/** Adaptateur Prisma de la conservation : un lot borné d'ids, du plus ancien. */
@Injectable()
export class PrismaCustomerRequestRetention extends CustomerRequestRetention {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dueBefore(before: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.customerRequest.findMany({
      where: {
        anonymizedAt: null,
        OR: [{ handledAt: { lt: before } }, { handledAt: null, receivedAt: { lt: before } }],
      },
      select: { id: true },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });
    return rows.map((row) => row.id);
  }
}
