import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LeadReader } from "../domain/ports/lead.reader.js";
import { rowToLeadView } from "./lead-mapping.js";
import type { LeadView } from "@lfd/contracts";

/** Adaptateur Prisma de lecture des leads cold (le plus récent en tête). */
@Injectable()
export class PrismaLeadReader extends LeadReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<LeadView[]> {
    const rows = await this.prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(rowToLeadView);
  }
}
