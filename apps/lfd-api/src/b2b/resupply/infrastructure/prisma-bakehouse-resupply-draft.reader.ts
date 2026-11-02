import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { BakehouseResupplyDraftSnapshot } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftReader } from "../domain/bakehouse-resupply-draft.reader.js";
import { draftSnapshotOf } from "./bakehouse-resupply-draft.row.js";

/**
 * Combien de brouillons ouverts la carte liste au plus. Le fournil en garde
 * quelques-uns ; au-delà, la liste ne grossirait plus qu'avec des oubliés, et
 * une page qui les rend tous n'a pas de fond (audit du réassort, M-C,
 * 2026-11-02). Les plus récents d'abord : ce sont eux qu'on reprend.
 */
export const OPEN_DRAFTS_LISTED = 100;

/** Lecture Prisma des brouillons ouverts du fournil (index `(status, updated_at)`), bornée. */
@Injectable()
export class PrismaBakehouseResupplyDraftReader extends BakehouseResupplyDraftReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listOpen(): Promise<readonly BakehouseResupplyDraftSnapshot[]> {
    const rows = await this.prisma.bakehouseResupplyDraft.findMany({
      where: { status: "open" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: OPEN_DRAFTS_LISTED,
    });
    return rows.map(draftSnapshotOf);
  }
}
