import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ClientNotebook } from "../domain/entities/client-notebook.js";
import { ClientNotebookRepository } from "../domain/ports/client-notebook.repository.js";
import { planNotebookWrites } from "./client-notebook-write-plan.js";

const NOTE_COLUMNS = {
  id: true,
  title: true,
  body: true,
  photoKey: true,
  createdByStaffId: true,
  createdByName: true,
} as const;

/**
 * Adaptateur Prisma du carnet de notes.
 *
 * Il ne décide de rien — ni du nombre de notes, ni de l'ordre. Il traduit l'état
 * de l'agrégat en lignes, **en n'écrivant que ce qui a changé** (D11,
 * {@link planNotebookWrites}) : la procédure de livraison réécrit chaque ligne à
 * chaque geste, ce qui à cinquante notes ferait cinquante `upsert` de contenu
 * pour une note ajoutée.
 *
 * Le mur `company_id` est dans chaque `where`, par le filtre de relation sur le
 * carnet.
 */
@Injectable()
export class PrismaClientNotebookRepository extends ClientNotebookRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadForCompany(companyId: string): Promise<ClientNotebook | null> {
    const row = await this.prisma.clientNotebook.findFirst({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        notes: { orderBy: { position: "asc" }, select: NOTE_COLUMNS },
      },
    });
    if (row === null) {
      return null;
    }
    return ClientNotebook.reconstitute({
      id: row.id,
      companyId: row.companyId,
      notes: row.notes.map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        photoKey: note.photoKey,
        // La colonne est nullable jusqu'à l'étape 5C du plan de l'auteur, mais
        // aucune ligne n'y est vide : 5A et 5B l'ont recopiée depuis
        // `created_by_sub`, qui était NOT NULL, et tout ce qui s'écrit depuis
        // la remplit. Le repli ne sert que le type (vérifié le
        // 2026-09-18) ; il part avec le NOT NULL.
        author: { staffUserId: note.createdByStaffId ?? "", name: note.createdByName },
      })),
    });
  }

  async save(notebook: ClientNotebook): Promise<void> {
    const state = notebook.toPersistence();
    const wall = { notebookId: state.id, notebook: { companyId: state.companyId } };
    await this.prisma.$transaction(async (tx) => {
      await tx.clientNotebook.upsert({
        where: { id: state.id, companyId: state.companyId },
        create: { id: state.id, companyId: state.companyId },
        // Rien à réécrire : l'identité d'un carnet ne change pas.
        update: {},
      });
      const stored = await tx.clientNote.findMany({
        where: wall,
        select: { id: true, position: true, title: true, body: true, photoKey: true },
      });
      const plan = planNotebookWrites(stored, state.notes);
      // Suppression PHYSIQUE des notes retirées — l'exception écrite au JSDoc de
      // `ClientNotebook.removeNote`.
      if (plan.removedIds.length > 0) {
        await tx.clientNote.deleteMany({ where: { ...wall, id: { in: [...plan.removedIds] } } });
      }
      for (const note of plan.created) {
        await tx.clientNote.create({ data: { ...note, notebookId: state.id } });
      }
      for (const note of plan.updated) {
        await tx.clientNote.updateMany({ where: { ...wall, id: note.id }, data: note.columns });
      }
    });
  }
}
