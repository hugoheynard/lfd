import type { SupportRequestView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SupportRequestReader } from "../domain/ports/support-request.reader.js";
import { toSupportRequestView } from "./support-request-mapping.js";

/** Adaptateur Prisma du lecteur de demandes de contact. */
@Injectable()
export class PrismaSupportRequestReader extends SupportRequestReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(supportRequestId: string): Promise<SupportRequestView | null> {
    const row = await this.prisma.supportRequest.findUnique({ where: { id: supportRequestId } });
    return row === null ? null : toSupportRequestView(row);
  }
}
