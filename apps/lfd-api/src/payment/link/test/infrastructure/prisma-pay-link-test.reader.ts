import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import type { PayLinkTest } from "../domain/pay-link-test.js";
import { PayLinkTestReader } from "../domain/ports/pay-link-test.reader.js";
import { toDomain } from "./pay-link-test-rows.js";

/** La liste des essais, la plus récente d'abord. */
@Injectable()
export class PrismaPayLinkTestReader extends PayLinkTestReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recent(limit: number): Promise<readonly PayLinkTest[]> {
    const rows = await this.prisma.payLinkTest.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(toDomain);
  }
}
