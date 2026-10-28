import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BakehouseResupplyDraft } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftChangedMeanwhileError } from "../domain/bakehouse-resupply-draft-errors.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { draftColumnsOf, draftSnapshotOf } from "./bakehouse-resupply-draft.row.js";

/**
 * Adaptateur Prisma des brouillons du fournil (`bakehouse_resupply_drafts`).
 * Un brouillon neuf s'insère ; ensuite il se réécrit sous la version lue —
 * zéro ligne touchée dit qu'un autre poste l'a écrit entre-temps (409).
 * Jamais supprimé.
 */
@Injectable()
export class PrismaBakehouseResupplyDraftRepository extends BakehouseResupplyDraftRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(draftId: string): Promise<BakehouseResupplyDraft | null> {
    const row = await this.prisma.bakehouseResupplyDraft.findUnique({ where: { id: draftId } });
    return row === null ? null : BakehouseResupplyDraft.restore(draftSnapshotOf(row));
  }

  async save(draft: BakehouseResupplyDraft): Promise<void> {
    if (draft.version === 0) {
      const { created } = draft;
      await this.prisma.bakehouseResupplyDraft.create({
        data: {
          id: draft.id,
          version: draft.nextVersion,
          createdAt: created.at,
          createdByStaffId: created.author.staffUserId,
          createdByName: created.author.name,
          createdByRole: created.author.role,
          ...draftColumnsOf(draft),
        },
      });
      return;
    }
    const { count } = await this.prisma.bakehouseResupplyDraft.updateMany({
      where: { id: draft.id, version: draft.version },
      data: { version: draft.nextVersion, ...draftColumnsOf(draft) },
    });
    if (count === 0) {
      throw new BakehouseResupplyDraftChangedMeanwhileError();
    }
  }
}
