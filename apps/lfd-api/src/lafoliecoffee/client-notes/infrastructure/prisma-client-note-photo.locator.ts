import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ClientNotePhotoLocator } from "../domain/ports/client-note-photo.locator.js";

/** La clé de photo d'une note, cherchée sous le mur `companyId`. */
@Injectable()
export class PrismaClientNotePhotoLocator extends ClientNotePhotoLocator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async photoKeyOf(companyId: string, noteId: string): Promise<string | null> {
    const row = await this.prisma.clientNote.findFirst({
      where: { id: noteId, notebook: { companyId } },
      select: { photoKey: true },
    });
    return row?.photoKey ?? null;
  }
}
