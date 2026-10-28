import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { BakehouseResupplyDraftSnapshot } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftReader } from "../domain/bakehouse-resupply-draft.reader.js";
import { draftSnapshotOf } from "./bakehouse-resupply-draft.row.js";

/** Lecture Prisma des brouillons ouverts du fournil (index `(status, updated_at)`). */
@Injectable()
export class PrismaBakehouseResupplyDraftReader extends BakehouseResupplyDraftReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listOpen(): Promise<readonly BakehouseResupplyDraftSnapshot[]> {
    const rows = await this.prisma.bakehouseResupplyDraft.findMany({
      where: { status: "open" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(draftSnapshotOf);
  }
}
