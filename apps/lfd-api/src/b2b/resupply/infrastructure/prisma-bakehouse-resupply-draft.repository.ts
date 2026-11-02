import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BakehouseResupplyDraft } from "../domain/bakehouse-resupply-draft.js";
import {
  BakehouseResupplyDraftAlreadyWrittenError,
  BakehouseResupplyDraftChangedMeanwhileError,
} from "../domain/bakehouse-resupply-draft-errors.js";
import { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { draftColumnsOf, draftSnapshotOf } from "./bakehouse-resupply-draft.row.js";

/**
 * Adaptateur Prisma des brouillons du fournil (`bakehouse_resupply_drafts`).
 * Un brouillon neuf s'insère — sa clé primaire est la clé de l'écran, un
 * doublon est `BakehouseResupplyDraftAlreadyWrittenError` ; ensuite il se réécrit sous la version lue —
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
      await this.create(draft);
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

  private async create(draft: BakehouseResupplyDraft): Promise<void> {
    const { created } = draft;
    try {
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
    } catch (error) {
      // La clé primaire : l'identifiant est la clé de l'écran (C-C), qu'un
      // même enregistrement rejoué en même temps a déjà écrite.
      if (isUniqueViolation(error)) {
        throw new BakehouseResupplyDraftAlreadyWrittenError(draft.id);
      }
      throw error;
    }
  }
}
