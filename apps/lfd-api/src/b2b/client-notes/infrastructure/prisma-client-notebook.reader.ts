import type { ClientNotebookView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { photoCardRevision } from "../../shared/photo-cards/domain/value-objects/photo-revision.js";
import { ClientNotebookReader } from "../domain/ports/client-notebook.reader.js";

/**
 * Lecture du carnet pour l'écran. Le numéro est le rang dans la liste triée, pas
 * la colonne `position` : un numéro affiché ne dépend pas de ce qu'une écriture
 * passée a laissé.
 */
@Injectable()
export class PrismaClientNotebookReader extends ClientNotebookReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string): Promise<ClientNotebookView> {
    const row = await this.prisma.clientNotebook.findFirst({
      where: { companyId },
      select: {
        notes: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            body: true,
            photoKey: true,
            createdAt: true,
            createdByName: true,
          },
        },
      },
    });
    const notes = (row?.notes ?? []).map((note, index) => ({
      id: note.id,
      number: index + 1,
      title: note.title,
      body: note.body,
      photoRevision: note.photoKey === null ? null : photoCardRevision(note.photoKey),
      createdAt: note.createdAt.toISOString(),
      createdByName: note.createdByName,
    }));
    return { companyId, notes };
  }
}
